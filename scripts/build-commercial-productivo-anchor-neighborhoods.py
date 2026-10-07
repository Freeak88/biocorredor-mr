#!/usr/bin/env python3
"""Construye vecindarios parcelarios Productivo alrededor de anclas comerciales públicas.

Lee candidatos de coordenadas extraídos directamente de páginas comerciales y:
- conserva sólo coordenadas que caen dentro de una parcela GeoARBA Productivo como anclas exactas de alta prioridad;
- identifica la parcela contenedora;
- lista parcelas Productivo próximas por distancia geométrica aproximada;
- agrupa por proyecto sin convertir el conjunto cercano en "polígono del emprendimiento".

Uso: priorizar adquisición/QA VHR y cruce administrativo. No prueba venta consumada,
subdivisión, aprobación, pertenencia completa del proyecto ni situación legal.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.ops import transform

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
DEFAULT_OUTPUT = Path("tmp/territorial-analysis/public-commercial-evidence/productivo-anchor-neighborhoods")
RADII_M = [100, 250, 500, 1000]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--coordinates", type=Path, default=DEFAULT_COORDS)
    p.add_argument("--assignments", type=Path, default=DEFAULT_ASSIGNMENTS)
    p.add_argument("--geoarba", nargs="+", type=Path, default=DEFAULT_GEOARBA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    return p.parse_args()


def load_json(path: Path):
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            return json.load(fh)
    return json.loads(path.read_text(encoding="utf-8"))


def load_productivo(path: Path) -> set[str]:
    data = load_json(path)
    vals = data.get("zones", {}).get("productiva", [])
    out = set()
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


def load_productivo_parcels(paths: list[Path], membership: set[str]) -> list[dict]:
    rows = []
    seen = set()
    for path in paths:
        data = load_json(path)
        for feat in data.get("features", []):
            props = feat.get("properties") or {}
            nom = str(props.get("nomenclatura") or "")
            if not nom or nom not in membership or nom in seen:
                continue
            try:
                geom = shape(feat["geometry"])
            except Exception:
                continue
            if geom.is_empty:
                continue
            seen.add(nom)
            rows.append({
                "nomenclatura": nom,
                "partida": str(props.get("partida") or ""),
                "superficie_m2": float(props.get("superficie_m2") or 0.0),
                "geom": geom,
            })
    return rows


def read_coordinate_rows(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def truthy(v) -> bool:
    return str(v).strip().lower() in {"1", "true", "yes", "si", "sí"}


def local_metric_transformer(lat0: float, lon0: float):
    # Aproximación local suficientemente precisa para radios <=1 km en este análisis.
    coslat = math.cos(math.radians(lat0))
    sx = 111_320.0 * coslat
    sy = 110_574.0

    def fn(x, y, z=None):
        # shapely.ops.transform puede pasar escalares o arrays según versión.
        try:
            return ((x - lon0) * sx, (y - lat0) * sy)
        except TypeError:
            return ([(xx - lon0) * sx for xx in x], [(yy - lat0) * sy for yy in y])
    return fn


def neighborhood(point: Point, parcels: list[dict], radii: list[int]) -> list[dict]:
    lat0, lon0 = point.y, point.x
    fn = local_metric_transformer(lat0, lon0)
    pm = transform(fn, point)
    out = []
    for r in parcels:
        gm = transform(fn, r["geom"])
        d = float(gm.distance(pm))
        if d <= max(radii):
            out.append({
                "nomenclatura": r["nomenclatura"],
                "partida": r["partida"],
                "superficie_m2": round(r["superficie_m2"], 2),
                "distance_m": round(d, 2),
                **{f"within_{radius}m": d <= radius for radius in radii},
            })
    out.sort(key=lambda x: (x["distance_m"], x["partida"]))
    return out


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    membership = load_productivo(args.assignments)
    parcels = load_productivo_parcels(args.geoarba, membership)
    rows = read_coordinate_rows(args.coordinates)

    # Anclas exactas: la propia coordenada embebida cae en parcela Productivo.
    anchors = []
    seen = set()
    for r in rows:
        if not truthy(r.get("containing_productivo")):
            continue
        try:
            lat = float(r["lat"]); lon = float(r["lon"])
        except (TypeError, ValueError):
            continue
        key = (str(r.get("project_id") or ""), round(lat, 6), round(lon, 6))
        if key in seen:
            continue
        seen.add(key)
        p = Point(lon, lat)
        nbh = neighborhood(p, parcels, RADII_M)
        containing = [x for x in nbh if x["distance_m"] == 0.0]
        anchors.append({
            "project_id": r.get("project_id"),
            "project_name": r.get("project_name"),
            "source": r.get("source"),
            "url": r.get("url"),
            "lat": lat,
            "lon": lon,
            "containing_productivo_parcels": containing,
            "neighborhood": nbh,
        })

    # Una fila por proyecto/parcela candidata próxima, preservando la distancia al ancla.
    flat = []
    for a in anchors:
        for x in a["neighborhood"]:
            flat.append({
                "project_id": a["project_id"],
                "project_name": a["project_name"],
                "anchor_lat": a["lat"],
                "anchor_lon": a["lon"],
                "source": a["source"],
                "nomenclatura": x["nomenclatura"],
                "partida": x["partida"],
                "superficie_m2": x["superficie_m2"],
                "distance_m": x["distance_m"],
                "contains_anchor": x["distance_m"] == 0.0,
                "within_100m": x["within_100m"],
                "within_250m": x["within_250m"],
                "within_500m": x["within_500m"],
                "within_1000m": x["within_1000m"],
            })

    csv_path = args.output_dir / "commercial-productivo-anchor-neighborhoods.csv"
    if flat:
        with csv_path.open("w", newline="", encoding="utf-8-sig") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(flat[0].keys()))
            wr.writeheader(); wr.writerows(flat)

    project_summary = []
    for project_id in sorted({str(a["project_id"]) for a in anchors}):
        aa = [a for a in anchors if str(a["project_id"]) == project_id]
        containing = {}
        within = {r: set() for r in RADII_M}
        for a in aa:
            for x in a["containing_productivo_parcels"]:
                containing[x["nomenclatura"]] = x
            for x in a["neighborhood"]:
                for radius in RADII_M:
                    if x[f"within_{radius}m"]:
                        within[radius].add(x["nomenclatura"])
        project_summary.append({
            "project_id": project_id,
            "project_name": aa[0]["project_name"],
            "anchors": len(aa),
            "containing_productivo_parcels": list(containing.values()),
            "productivo_parcels_within_100m": len(within[100]),
            "productivo_parcels_within_250m": len(within[250]),
            "productivo_parcels_within_500m": len(within[500]),
            "productivo_parcels_within_1000m": len(within[1000]),
        })

    qa = {
        "scope": "commercial source coordinates that fall inside canonical Productivo parcels",
        "productivo_membership_total": len(membership),
        "productivo_geometries_loaded": len(parcels),
        "source_coordinate_rows": len(rows),
        "exact_productivo_anchor_points": len(anchors),
        "projects_with_exact_productivo_anchor": len(project_summary),
        "radii_m": RADII_M,
        "projects": project_summary,
        "warning": (
            "Neighborhood parcels are search/QA candidates around a commercial anchor. "
            "They are not inferred project boundaries and must not be summed as project area or sold area without independent evidence."
        ),
    }
    qa_path = args.output_dir / "commercial-productivo-anchor-neighborhoods-qa.json"
    qa_path.write_text(json.dumps(qa, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=== COMMERCIAL PRODUCTIVO ANCHOR NEIGHBORHOODS QA ===")
    print(json.dumps(qa, indent=2, ensure_ascii=False))
    print(f"csv={csv_path}")
    print(f"qa={qa_path}")


if __name__ == "__main__":
    main()
