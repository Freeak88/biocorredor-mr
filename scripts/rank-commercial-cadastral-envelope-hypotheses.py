#!/usr/bin/env python3
"""Rankea hipótesis catastrales alrededor de anclas comerciales con superficie declarada.

Caso de uso inicial: Saint Henri declara ~55 ha, mientras el pin comercial cae dentro
de una parcela GeoARBA Productivo de ~4.14 ha. Este script NO asume que esa parcela
sea el proyecto ni que el proyecto esté íntegramente en Productivo.

Método:
- toma una coordenada comercial que cae en una parcela GeoARBA;
- carga TODAS las parcelas GeoARBA cercanas, sin filtrar por zonificación;
- construye un grafo de vecindad espacial;
- mediante beam search genera conjuntos catastrales conectados que contienen la
  parcela del ancla y aproximan la superficie bruta comercial declarada;
- para cada hipótesis calcula cuánta superficie/parcelas pertenecen al universo
  canónico Productivo.

Las salidas son hipótesis para QA visual/catastral. No son límites de proyecto,
ventas, aprobación, incumplimiento, irregularidad ni ilegalidad.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
from pathlib import Path

from shapely.geometry import Point, mapping, shape
from shapely.ops import transform, unary_union

DEFAULT_EVIDENCE = Path("config/territorial/public-commercial-evidence.json")
DEFAULT_COORDS = Path(
    "tmp/territorial-analysis/public-commercial-evidence/source-coordinate-resolution/"
    "public-commercial-source-coordinates.csv"
)
DEFAULT_ASSIGNMENTS = Path("public/data/auditoria/zonificacion-11819-asignaciones.json.gz")
DEFAULT_GEOARBA = [
    Path("public/data/geoarba/ministro-rivadavia-parcels-noreste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-noroeste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-sureste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-suroeste.geojson"),
]
DEFAULT_OUTPUT = Path("tmp/territorial-analysis/public-commercial-evidence/cadastral-envelope-hypotheses")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--project-id", default="saint-henri-aero-country-club")
    p.add_argument("--evidence", type=Path, default=DEFAULT_EVIDENCE)
    p.add_argument("--coordinates", type=Path, default=DEFAULT_COORDS)
    p.add_argument("--assignments", type=Path, default=DEFAULT_ASSIGNMENTS)
    p.add_argument("--geoarba", nargs="+", type=Path, default=DEFAULT_GEOARBA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--search-radius-m", type=float, default=1400.0)
    p.add_argument("--adjacency-gap-m", type=float, default=8.0)
    p.add_argument("--beam-width", type=int, default=500)
    p.add_argument("--max-steps", type=int, default=40)
    p.add_argument("--topn", type=int, default=20)
    p.add_argument("--max-area-factor", type=float, default=1.35)
    return p.parse_args()


def load_json(path: Path):
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            return json.load(fh)
    return json.loads(path.read_text(encoding="utf-8"))


def load_productivo(path: Path) -> set[str]:
    data = load_json(path)
    vals = data.get("zones", {}).get("productiva", [])
    out: set[str] = set()
    for x in vals:
        if isinstance(x, str):
            out.add(x)
        elif isinstance(x, dict):
            n = x.get("nomenclatura") or x.get("id")
            if n:
                out.add(str(n))
    return out


def read_csv(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def local_transformer(lat0: float, lon0: float):
    coslat = math.cos(math.radians(lat0))
    sx = 111_320.0 * coslat
    sy = 110_574.0

    def fn(x, y, z=None):
        try:
            return ((x - lon0) * sx, (y - lat0) * sy)
        except TypeError:
            return ([(xx - lon0) * sx for xx in x], [(yy - lat0) * sy for yy in y])
    return fn


def load_all_parcels(paths: list[Path], productivo: set[str], lat0: float, lon0: float, radius_m: float):
    fn = local_transformer(lat0, lon0)
    anchor_m = transform(fn, Point(lon0, lat0))
    out = []
    seen = set()
    for path in paths:
        data = load_json(path)
        for feat in data.get("features", []):
            props = feat.get("properties") or {}
            nom = str(props.get("nomenclatura") or "")
            key = nom or str(props.get("partida") or "")
            if not key or key in seen:
                continue
            try:
                geom = shape(feat["geometry"])
            except Exception:
                continue
            if geom.is_empty:
                continue
            gm = transform(fn, geom)
            if gm.distance(anchor_m) > radius_m:
                continue
            seen.add(key)
            attr_area = float(props.get("superficie_m2") or 0.0)
            geom_area = float(gm.area)
            area_m2 = attr_area if attr_area > 0 else geom_area
            out.append({
                "nomenclatura": nom,
                "partida": str(props.get("partida") or ""),
                "productivo": nom in productivo,
                "geom": geom,
                "geom_m": gm,
                "area_m2": area_m2,
            })
    return out


def find_anchor_idx(parcels: list[dict], point: Point) -> int:
    hits = [i for i, r in enumerate(parcels) if r["geom"].covers(point)]
    if not hits:
        raise RuntimeError("La coordenada comercial seleccionada no cae dentro de ninguna parcela GeoARBA cargada")
    # Si hay superposición, privilegiar la parcela de menor área geométrica.
    return min(hits, key=lambda i: parcels[i]["geom_m"].area)


def build_adjacency(parcels: list[dict], gap_m: float) -> list[set[int]]:
    n = len(parcels)
    adj = [set() for _ in range(n)]
    # El universo local suele ser pequeño; O(n²) deja la lógica auditable y portable.
    for i in range(n):
        gi = parcels[i]["geom_m"]
        for j in range(i + 1, n):
            gj = parcels[j]["geom_m"]
            if gi.distance(gj) <= gap_m:
                adj[i].add(j); adj[j].add(i)
    return adj


def state_metrics(state: frozenset[int], parcels: list[dict], target_m2: float) -> dict:
    area = sum(parcels[i]["area_m2"] for i in state)
    prod_area = sum(parcels[i]["area_m2"] for i in state if parcels[i]["productivo"])
    prod_count = sum(1 for i in state if parcels[i]["productivo"])
    area_gap = abs(area - target_m2) / max(target_m2, 1.0)

    union_m = unary_union([parcels[i]["geom_m"] for i in state])
    hull_area = float(union_m.convex_hull.area) if not union_m.is_empty else 0.0
    union_area = float(union_m.area) if not union_m.is_empty else 0.0
    compact_fill = union_area / hull_area if hull_area > 0 else 0.0
    # El área declarada es la señal principal; compactness sólo rompe empates y evita cadenas absurdas.
    score = area_gap + 0.18 * (1.0 - compact_fill)
    return {
        "area_m2": area,
        "productivo_area_m2": prod_area,
        "productivo_count": prod_count,
        "area_gap_ratio": area_gap,
        "compact_fill": compact_fill,
        "rank_score": score,
        "union_geom": unary_union([parcels[i]["geom"] for i in state]),
    }


def beam_search(anchor_idx: int, parcels: list[dict], adj: list[set[int]], target_m2: float, args) -> list[tuple[frozenset[int], dict]]:
    start = frozenset([anchor_idx])
    beam = [start]
    visited = {start}
    candidates: list[tuple[frozenset[int], dict]] = []
    max_area = target_m2 * args.max_area_factor

    for _step in range(args.max_steps):
        expanded = []
        for state in beam:
            met = state_metrics(state, parcels, target_m2)
            candidates.append((state, met))
            frontier = set()
            for i in state:
                frontier.update(adj[i])
            frontier.difference_update(state)
            for j in frontier:
                ns = frozenset((*state, j))
                if ns in visited:
                    continue
                visited.add(ns)
                area = met["area_m2"] + parcels[j]["area_m2"]
                if area > max_area:
                    continue
                nm = state_metrics(ns, parcels, target_m2)
                expanded.append((nm["rank_score"], ns))
        if not expanded:
            break
        expanded.sort(key=lambda x: x[0])
        beam = [s for _, s in expanded[: args.beam_width]]

    # Dedupe y ranking final.
    best = {}
    for state, met in candidates:
        key = tuple(sorted(state))
        if key not in best or met["rank_score"] < best[key][1]["rank_score"]:
            best[key] = (state, met)
    vals = list(best.values())
    vals.sort(key=lambda x: (x[1]["rank_score"], x[1]["area_gap_ratio"], -x[1]["compact_fill"]))
    return vals[: args.topn]


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    evidence = load_json(args.evidence)
    project = next((p for p in evidence.get("projects", []) if p.get("id") == args.project_id), None)
    if not project:
        raise RuntimeError(f"Proyecto no encontrado: {args.project_id}")
    target_ha = float((project.get("project_claims") or {}).get("gross_area_ha") or 0.0)
    if target_ha <= 0:
        raise RuntimeError(f"{args.project_id} no tiene project_claims.gross_area_ha")
    target_m2 = target_ha * 10_000.0

    coord_rows = [r for r in read_csv(args.coordinates) if r.get("project_id") == args.project_id]
    coord_rows = [r for r in coord_rows if str(r.get("containing_productivo", "")).lower() in {"true", "1", "yes"}]
    if not coord_rows:
        raise RuntimeError(f"No hay ancla comercial dentro de GeoARBA/Productivo para {args.project_id}")
    # Si hay varias, usar la primera coordenada única; no promediar pins comerciales.
    anchor = coord_rows[0]
    lat = float(anchor["lat"]); lon = float(anchor["lon"])
    point = Point(lon, lat)

    productivo = load_productivo(args.assignments)
    parcels = load_all_parcels(args.geoarba, productivo, lat, lon, args.search_radius_m)
    anchor_idx = find_anchor_idx(parcels, point)
    adj = build_adjacency(parcels, args.adjacency_gap_m)
    ranked = beam_search(anchor_idx, parcels, adj, target_m2, args)

    rows = []
    features = []
    for rank, (state, met) in enumerate(ranked, 1):
        noms = [parcels[i]["nomenclatura"] for i in sorted(state)]
        partidas = [parcels[i]["partida"] for i in sorted(state)]
        prod_noms = [parcels[i]["nomenclatura"] for i in sorted(state) if parcels[i]["productivo"]]
        prod_share = met["productivo_area_m2"] / met["area_m2"] if met["area_m2"] > 0 else 0.0
        row = {
            "rank": rank,
            "project_id": args.project_id,
            "target_gross_area_ha_claim": round(target_ha, 4),
            "hypothesis_area_ha": round(met["area_m2"] / 10_000.0, 4),
            "area_gap_pct": round(100.0 * met["area_gap_ratio"], 2),
            "parcel_count": len(state),
            "productivo_parcel_count": met["productivo_count"],
            "productivo_area_ha": round(met["productivo_area_m2"] / 10_000.0, 4),
            "productivo_area_share_pct": round(100.0 * prod_share, 2),
            "non_productivo_area_ha": round((met["area_m2"] - met["productivo_area_m2"]) / 10_000.0, 4),
            "compact_fill": round(met["compact_fill"], 4),
            "rank_score": round(met["rank_score"], 6),
            "nomenclaturas": json.dumps(noms, ensure_ascii=False),
            "partidas": json.dumps(partidas, ensure_ascii=False),
            "productivo_nomenclaturas": json.dumps(prod_noms, ensure_ascii=False),
        }
        rows.append(row)
        features.append({
            "type": "Feature",
            "properties": {k: v for k, v in row.items() if k not in {"nomenclaturas", "partidas", "productivo_nomenclaturas"}},
            "geometry": mapping(met["union_geom"]),
        })

    csv_path = args.output_dir / f"{args.project_id}-cadastral-envelope-hypotheses.csv"
    with csv_path.open("w", newline="", encoding="utf-8-sig") as fh:
        wr = csv.DictWriter(fh, fieldnames=list(rows[0].keys()) if rows else ["rank"])
        wr.writeheader(); wr.writerows(rows)

    geojson_path = args.output_dir / f"{args.project_id}-cadastral-envelope-hypotheses.geojson"
    geojson_path.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False), encoding="utf-8")

    anchor_parcel = parcels[anchor_idx]
    qa = {
        "project_id": args.project_id,
        "project_name": project.get("name"),
        "target_gross_area_ha_claim": target_ha,
        "anchor": {"lat": lat, "lon": lon, "nomenclatura": anchor_parcel["nomenclatura"], "partida": anchor_parcel["partida"], "productivo": anchor_parcel["productivo"], "area_ha": round(anchor_parcel["area_m2"] / 10000.0, 4)},
        "all_geoarba_parcels_considered": len(parcels),
        "search_radius_m": args.search_radius_m,
        "adjacency_gap_m": args.adjacency_gap_m,
        "hypotheses_returned": len(rows),
        "top_hypotheses": rows[:10],
        "warning": "Estas combinaciones son hipótesis catastrales conectadas compatibles en superficie con el claim comercial. No son límites probados del emprendimiento. Su fracción Productivo sirve únicamente para decidir qué hipótesis revisar contra VHR, planos y antecedentes administrativos.",
    }
    qa_path = args.output_dir / f"{args.project_id}-cadastral-envelope-hypotheses-qa.json"
    qa_path.write_text(json.dumps(qa, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=== COMMERCIAL CADASTRAL ENVELOPE HYPOTHESES QA ===")
    print(json.dumps({k: qa[k] for k in ["project_id", "project_name", "target_gross_area_ha_claim", "anchor", "all_geoarba_parcels_considered", "search_radius_m", "adjacency_gap_m", "hypotheses_returned", "warning"]}, indent=2, ensure_ascii=False))
    for r in rows[:10]:
        print(f"rank={r['rank']} area_ha={r['hypothesis_area_ha']} gap={r['area_gap_pct']}% productivo_share={r['productivo_area_share_pct']}% parcels={r['parcel_count']} productivo_parcels={r['productivo_parcel_count']}")
    print(f"csv={csv_path}")
    print(f"geojson={geojson_path}")
    print(f"qa={qa_path}")


if __name__ == "__main__":
    main()
