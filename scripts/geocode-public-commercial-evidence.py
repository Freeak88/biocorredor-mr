#!/usr/bin/env python3
"""Geocodifica evidencia comercial pública y la cruza con GeoARBA/Productivo.

Objetivo:
- transformar nombres/direcciones de proyectos comerciales en anclas espaciales;
- detectar si el punto geocodificado cae dentro de una parcela GeoARBA actual;
- indicar si esa parcela pertenece al universo canónico Productivo;
- listar parcelas Productivo cercanas cuando no haya match exacto.

Reglas de evidencia:
- un geocode es una aproximación espacial, no un polígono de emprendimiento;
- una publicación comercial prueba marketing/oferta pública, no venta consumada;
- match con GeoARBA no prueba aprobación, subdivisión, cumplimiento ni legalidad.

El script usa Nominatim/OpenStreetMap sólo para resolver direcciones y cachea respuestas.
No sobreescribe el corpus fuente.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
import time
import urllib.parse
import urllib.request
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

DEFAULT_EVIDENCE = Path("config/territorial/public-commercial-evidence.json")
DEFAULT_ASSIGNMENTS = Path("public/data/auditoria/zonificacion-11819-asignaciones.json.gz")
DEFAULT_GEOARBA = [
    Path("public/data/geoarba/ministro-rivadavia-parcels-noreste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-noroeste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-sureste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-suroeste.geojson"),
]
DEFAULT_OUTPUT = Path("tmp/territorial-analysis/public-commercial-evidence")
NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "BioCorredor-MR-territorial-audit/1.0"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--evidence", type=Path, default=DEFAULT_EVIDENCE)
    p.add_argument("--assignments", type=Path, default=DEFAULT_ASSIGNMENTS)
    p.add_argument("--geoarba", nargs="+", type=Path, default=DEFAULT_GEOARBA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--max-results", type=int, default=5)
    p.add_argument("--nearest-productivo", type=int, default=5)
    p.add_argument("--sleep-seconds", type=float, default=1.1)
    p.add_argument("--refresh", action="store_true")
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
    if not out:
        raise RuntimeError(f"Sin zones.productiva en {path}")
    return out


def load_parcels(paths: list[Path], productivo: set[str]):
    records = []
    geoms = []
    for path in paths:
        data = load_json(path)
        for feat in data.get("features", []):
            geom_raw = feat.get("geometry")
            if not geom_raw:
                continue
            geom = shape(geom_raw)
            if geom.is_empty:
                continue
            props = dict(feat.get("properties") or {})
            nom = str(props.get("nomenclatura") or "")
            rec = {
                "nomenclatura": nom,
                "partida": str(props.get("partida") or ""),
                "productivo": nom in productivo,
                "geom": geom,
            }
            records.append(rec)
            geoms.append(geom)
    tree = STRtree(geoms)
    id_to_rec = {id(g): r for g, r in zip(geoms, records)}
    return records, geoms, tree, id_to_rec


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371008.8
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def geocode_query(query: str, max_results: int) -> list[dict]:
    params = {
        "q": query,
        "format": "jsonv2",
        "limit": str(max_results),
        "addressdetails": "1",
        "countrycodes": "ar",
    }
    url = NOMINATIM + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def project_queries(project: dict) -> list[str]:
    name = str(project.get("name") or "").strip()
    loc = str(project.get("location_claim") or "").strip()
    variants = []
    if loc:
        variants.append(f"{loc}, Buenos Aires, Argentina")
    if name and loc:
        variants.append(f"{name}, {loc}, Buenos Aires, Argentina")
    if name:
        variants.append(f"{name}, Almirante Brown, Buenos Aires, Argentina")
    seen = set()
    out = []
    for q in variants:
        if q not in seen:
            seen.add(q); out.append(q)
    return out


def choose_best(candidates: list[dict], project: dict) -> tuple[dict | None, str]:
    if not candidates:
        return None, "unresolved"
    loc = str(project.get("location_claim") or "").lower()
    name = str(project.get("name") or "").lower()
    scored = []
    for c in candidates:
        disp = str(c.get("display_name") or "").lower()
        score = float(c.get("importance") or 0.0)
        if "almirante brown" in disp:
            score += 0.30
        if "ministro rivadavia" in disp or "longchamps" in disp:
            score += 0.30
        for token in ["calder", "chivilcoy", "rivera", "lezica", "espora", "san zeballos"]:
            if token in loc and token in disp:
                score += 0.20
        for token in ["saint", "ramona", "america", "américa", "vicente"]:
            if token in name and token in disp:
                score += 0.15
        scored.append((score, c))
    scored.sort(key=lambda x: x[0], reverse=True)
    best_score, best = scored[0]
    status = "resolved_high" if best_score >= 0.55 else "resolved_low"
    return best, status


def point_matches(point: Point, geoms, tree, id_to_rec):
    containing = []
    idxs = tree.query(point)
    for idx in idxs:
        g = geoms[int(idx)] if isinstance(idx, (int,)) else idx
        if g.covers(point):
            rec = id_to_rec.get(id(g))
            if rec:
                containing.append(rec)
    return containing


def nearest_productivo(point: Point, records: list[dict], n: int) -> list[dict]:
    lat, lon = point.y, point.x
    vals = []
    for r in records:
        if not r["productivo"]:
            continue
        c = r["geom"].representative_point()
        d = haversine_m(lat, lon, c.y, c.x)
        vals.append((d, r))
    vals.sort(key=lambda x: x[0])
    return [
        {"nomenclatura": r["nomenclatura"], "partida": r["partida"], "distance_to_repr_point_m": round(d, 1)}
        for d, r in vals[:n]
    ]


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    cache_path = args.output_dir / "nominatim-cache.json"
    cache = {} if args.refresh or not cache_path.exists() else load_json(cache_path)

    evidence = load_json(args.evidence)
    productivo = load_productivo(args.assignments)
    records, geoms, tree, id_to_rec = load_parcels(args.geoarba, productivo)

    results = []
    for project in evidence.get("projects", []):
        all_candidates: list[dict] = []
        used_queries = []
        for query in project_queries(project):
            used_queries.append(query)
            if query not in cache:
                try:
                    cache[query] = geocode_query(query, args.max_results)
                except Exception as exc:
                    cache[query] = {"_error": str(exc)}
                cache_path.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")
                time.sleep(args.sleep_seconds)
            cached = cache.get(query)
            if isinstance(cached, list):
                all_candidates.extend(cached)

        best, status = choose_best(all_candidates, project)
        out = {
            "project_id": project.get("id"),
            "project_name": project.get("name"),
            "location_claim": project.get("location_claim"),
            "geocode_status": status,
            "queries": used_queries,
            "source_count": len(project.get("sources", [])),
        }
        if best is not None:
            lat = float(best["lat"]); lon = float(best["lon"])
            p = Point(lon, lat)
            containing = point_matches(p, geoms, tree, id_to_rec)
            out.update({
                "lat": lat,
                "lon": lon,
                "geocode_display_name": best.get("display_name"),
                "geocode_type": best.get("type"),
                "geocode_importance": best.get("importance"),
                "containing_geoarba": [
                    {"nomenclatura": r["nomenclatura"], "partida": r["partida"], "productivo": r["productivo"]}
                    for r in containing
                ],
                "containing_productivo": any(r["productivo"] for r in containing),
                "nearest_productivo": nearest_productivo(p, records, args.nearest_productivo),
            })
        else:
            out.update({
                "lat": None,
                "lon": None,
                "geocode_display_name": None,
                "containing_geoarba": [],
                "containing_productivo": False,
                "nearest_productivo": [],
            })
        results.append(out)

    qa = {
        "scope": "public commercial evidence geocoding against current GeoARBA and canonical Productivo membership",
        "projects": len(results),
        "resolved_high": sum(r["geocode_status"] == "resolved_high" for r in results),
        "resolved_low": sum(r["geocode_status"] == "resolved_low" for r in results),
        "unresolved": sum(r["geocode_status"] == "unresolved" for r in results),
        "points_inside_productivo_parcel": sum(bool(r.get("containing_productivo")) for r in results),
        "warning": "Geocoding is a spatial search anchor, not a development polygon. Commercial sources evidence public marketing only; they do not prove completed sales, administrative approval, subdivision, compliance, irregularity or illegality.",
        "results": results,
    }
    qa_path = args.output_dir / "public-commercial-geocode-qa.json"
    qa_path.write_text(json.dumps(qa, indent=2, ensure_ascii=False), encoding="utf-8")

    csv_path = args.output_dir / "public-commercial-geocode.csv"
    with csv_path.open("w", newline="", encoding="utf-8-sig") as fh:
        fields = ["project_id", "project_name", "location_claim", "geocode_status", "lat", "lon", "geocode_display_name", "containing_productivo", "containing_geoarba", "nearest_productivo"]
        wr = csv.DictWriter(fh, fieldnames=fields)
        wr.writeheader()
        for r in results:
            wr.writerow({
                **{k: r.get(k) for k in fields},
                "containing_geoarba": json.dumps(r.get("containing_geoarba", []), ensure_ascii=False),
                "nearest_productivo": json.dumps(r.get("nearest_productivo", []), ensure_ascii=False),
            })

    print("=== PUBLIC COMMERCIAL EVIDENCE GEOCODE QA ===")
    print(json.dumps({k: qa[k] for k in ["projects", "resolved_high", "resolved_low", "unresolved", "points_inside_productivo_parcel", "warning"]}, indent=2, ensure_ascii=False))
    for r in results:
        print(f"{r['geocode_status']:>13} | {r['project_name']} | {r.get('lat')} {r.get('lon')} | containing_productivo={r.get('containing_productivo')} | containing={r.get('containing_geoarba')}")
    print(f"csv={csv_path}")
    print(f"qa={qa_path}")
    print(f"cache={cache_path}")


if __name__ == "__main__":
    main()
