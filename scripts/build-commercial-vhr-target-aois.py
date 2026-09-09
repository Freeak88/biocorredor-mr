#!/usr/bin/env python3
"""Construye AOIs de adquisición VHR alrededor de anclas comerciales Productivo.

Lee el CSV de vecindarios comerciales y produce, por proyecto:
- punto(s) ancla comercial(es);
- parcelas Productivo dentro de 500 m como candidatos de QA;
- bbox WGS84 de adquisición con margen adicional;
- dimensiones aproximadas a z18 para planificar mosaicos comparables con Cluster 2.

Respeta correcciones manuales de zonificación de proyecto. Un pin comercial que caiga
sobre Productivo no puede promover por sí solo un proyecto conocido fuera del scope
Productivo principal.

El AOI NO es el límite del emprendimiento. Es sólo un recorte de adquisición/QA.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
from collections import defaultdict
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

DEFAULT_NEIGHBORHOODS = Path(
    "tmp/territorial-analysis/public-commercial-evidence/productivo-anchor-neighborhoods/"
    "commercial-productivo-anchor-neighborhoods.csv"
)
DEFAULT_ASSIGNMENTS = Path("public/data/auditoria/zonificacion-11819-asignaciones.json.gz")
DEFAULT_OVERRIDES = Path("config/territorial/project-zoning-overrides.json")
DEFAULT_GEOARBA = [
    Path("public/data/geoarba/ministro-rivadavia-parcels-noreste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-noroeste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-sureste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-suroeste.geojson"),
]
DEFAULT_OUTPUT = Path("tmp/territorial-analysis/public-commercial-evidence/vhr-target-aois")


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--neighborhoods", type=Path, default=DEFAULT_NEIGHBORHOODS)
    p.add_argument("--assignments", type=Path, default=DEFAULT_ASSIGNMENTS)
    p.add_argument("--overrides", type=Path, default=DEFAULT_OVERRIDES)
    p.add_argument("--geoarba", nargs="+", type=Path, default=DEFAULT_GEOARBA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--candidate-radius-m", type=int, default=500)
    p.add_argument("--margin-m", type=int, default=180)
    p.add_argument("--zoom", type=int, default=18)
    return p.parse_args()


def load_json(path: Path):
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            return json.load(fh)
    return json.loads(path.read_text(encoding="utf-8"))


def load_membership(path: Path) -> set[str]:
    data = load_json(path)
    vals = data.get("zones", {}).get("productiva", [])
    out = set()
    for x in vals:
        if isinstance(x, str): out.add(x)
        elif isinstance(x, dict):
            n = x.get("nomenclatura") or x.get("id")
            if n: out.add(str(n))
    return out


def load_project_scope_overrides(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    data = load_json(path)
    return dict(data.get("projects") or {})


def load_geoms(paths, membership):
    out = {}
    for path in paths:
        data = load_json(path)
        for feat in data.get("features", []):
            p = feat.get("properties") or {}
            n = str(p.get("nomenclatura") or "")
            if not n or n not in membership or n in out: continue
            try: g = shape(feat["geometry"])
            except Exception: continue
            if g.is_empty: continue
            out[n] = {"geom": g, "partida": str(p.get("partida") or ""), "superficie_m2": float(p.get("superficie_m2") or 0.0)}
    return out


def meters_to_deg(lat: float, meters: float):
    dlat = meters / 110_574.0
    dlon = meters / (111_320.0 * math.cos(math.radians(lat)))
    return dlon, dlat


def world_px(lon: float, lat: float, z: int):
    n = 256 * (2 ** z)
    x = (lon + 180.0) / 360.0 * n
    lat = max(min(lat, 85.05112878), -85.05112878)
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x, y


def main():
    a = parse_args(); a.output_dir.mkdir(parents=True, exist_ok=True)
    membership = load_membership(a.assignments)
    overrides = load_project_scope_overrides(a.overrides)
    geoms = load_geoms(a.geoarba, membership)

    with a.neighborhoods.open("r", encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))

    grouped = defaultdict(list)
    for r in rows:
        grouped[str(r.get("project_id") or "")].append(r)

    fc_features = []
    summaries = []
    excluded_projects = []
    for project_id, vals in sorted(grouped.items()):
        if not project_id: continue
        override = overrides.get(project_id) or {}
        if override.get("main_productivo_scope") is False:
            excluded_projects.append({
                "project_id": project_id,
                "project_name": str(vals[0].get("project_name") or project_id),
                "zoning_context": override.get("zoning_context"),
                "reason": "excluded_by_project_zoning_override",
            })
            continue

        name = str(vals[0].get("project_name") or project_id)
        selected = []
        for r in vals:
            try: d = float(r.get("distance_m") or 1e9)
            except ValueError: continue
            if d <= a.candidate_radius_m and r.get("nomenclatura") in geoms:
                selected.append(r)
        noms = sorted({str(r["nomenclatura"]) for r in selected})
        gs = [geoms[n]["geom"] for n in noms]
        if not gs: continue
        u = unary_union(gs)
        c = u.centroid
        dlon, dlat = meters_to_deg(c.y, a.margin_m)
        minx, miny, maxx, maxy = u.bounds
        bbox = [minx-dlon, miny-dlat, maxx+dlon, maxy+dlat]
        x0,y0 = world_px(bbox[0], bbox[3], a.zoom)
        x1,y1 = world_px(bbox[2], bbox[1], a.zoom)
        width = int(math.ceil(abs(x1-x0))); height = int(math.ceil(abs(y1-y0)))
        total_attr_area = sum(geoms[n]["superficie_m2"] for n in noms)

        anchors = []
        seen = set()
        for r in vals:
            try: lat=float(r["anchor_lat"]); lon=float(r["anchor_lon"])
            except Exception: continue
            k=(round(lat,6),round(lon,6))
            if k not in seen:
                seen.add(k); anchors.append([lon,lat])

        summaries.append({
            "project_id": project_id,
            "project_name": name,
            "candidate_radius_m": a.candidate_radius_m,
            "candidate_productivo_parcels": len(noms),
            "candidate_attribute_area_ha_not_project_area": round(total_attr_area/10000, 4),
            "bbox_wgs84": bbox,
            "zoom": a.zoom,
            "approx_width_px": width,
            "approx_height_px": height,
            "anchors": anchors,
            "warning": "candidate parcel sum and AOI are acquisition/QA constructs, not inferred development boundary or sold area",
        })
        fc_features.append({
            "type":"Feature",
            "properties": {"project_id":project_id,"project_name":name,"kind":"candidate_productivo_union_500m","candidate_parcels":len(noms)},
            "geometry": mapping(u),
        })
        fc_features.append({
            "type":"Feature",
            "properties": {"project_id":project_id,"project_name":name,"kind":"vhr_acquisition_bbox"},
            "geometry": {"type":"Polygon","coordinates":[[[bbox[0],bbox[1]],[bbox[2],bbox[1]],[bbox[2],bbox[3]],[bbox[0],bbox[3]],[bbox[0],bbox[1]]]]},
        })
        for i,(lon,lat) in enumerate(anchors,1):
            fc_features.append({"type":"Feature","properties":{"project_id":project_id,"project_name":name,"kind":"commercial_anchor","anchor_index":i},"geometry":{"type":"Point","coordinates":[lon,lat]}})

    geojson_path = a.output_dir / "commercial-vhr-target-aois.geojson"
    geojson_path.write_text(json.dumps({"type":"FeatureCollection","features":fc_features}, ensure_ascii=False, indent=2), encoding="utf-8")
    qa = {
        "scope":"Productivo candidate neighborhoods around exact commercial anchors, respecting manual project zoning overrides",
        "candidate_radius_m":a.candidate_radius_m,
        "margin_m":a.margin_m,
        "zoom":a.zoom,
        "projects":summaries,
        "excluded_projects": excluded_projects,
        "warning":"AOIs are for VHR acquisition and QA only; they are not project polygons and areas must not be treated as sold/developed area.",
    }
    qa_path = a.output_dir / "commercial-vhr-target-aois-qa.json"
    qa_path.write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")
    print("=== COMMERCIAL VHR TARGET AOIS QA ===")
    print(json.dumps(qa, ensure_ascii=False, indent=2))
    print(f"geojson={geojson_path}")
    print(f"qa={qa_path}")

if __name__ == "__main__":
    main()
