#!/usr/bin/env python3
"""Extrae coordenadas embebidas en páginas comerciales y cruza con GeoARBA/Productivo.

Complementa a Nominatim, que tiene baja cobertura de direcciones/urbanizaciones locales.
Busca pares lat/lon en HTML/JSON-LD de las fuentes públicas ya persistidas.

Regla: una coordenada de publicación es un ancla comercial aproximada, no un polígono
ni prueba de venta consumada, aprobación, subdivisión, cumplimiento o legalidad.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import re
import urllib.request
from pathlib import Path
from shapely.geometry import Point, shape

DEFAULT_EVIDENCE = Path("config/territorial/public-commercial-evidence.json")
DEFAULT_ASSIGNMENTS = Path("public/data/auditoria/zonificacion-11819-asignaciones.json.gz")
DEFAULT_GEOARBA = [
    Path("public/data/geoarba/ministro-rivadavia-parcels-noreste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-noroeste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-sureste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-suroeste.geojson"),
]
DEFAULT_OUTPUT = Path("tmp/territorial-analysis/public-commercial-evidence/source-coordinate-resolution")
UA = "Mozilla/5.0 BioCorredor-MR-territorial-audit/1.0"

# Bounding box amplia para GBA Sur; descarta coordenadas espurias del HTML.
LAT_MIN, LAT_MAX = -35.30, -34.45
LON_MIN, LON_MAX = -59.00, -57.80

PATTERNS = [
    re.compile(r'"latitude"\s*:\s*"?(-?\d{2}\.\d+)"?.{0,300}?"longitude"\s*:\s*"?(-?\d{2}\.\d+)"?', re.I | re.S),
    re.compile(r'"lat"\s*:\s*"?(-?\d{2}\.\d+)"?.{0,120}?"(?:lng|lon)"\s*:\s*"?(-?\d{2}\.\d+)"?', re.I | re.S),
    re.compile(r'(?:latitude|lat)=(-?\d{2}\.\d+).{0,120}?(?:longitude|lng|lon)=(-?\d{2}\.\d+)', re.I | re.S),
    re.compile(r'center=(-?\d{2}\.\d+)%2C(-?\d{2}\.\d+)', re.I),
    re.compile(r'@(-?\d{2}\.\d+),(-?\d{2}\.\d+),\d+(?:\.\d+)?z', re.I),
]


def args():
    p = argparse.ArgumentParser()
    p.add_argument("--evidence", type=Path, default=DEFAULT_EVIDENCE)
    p.add_argument("--assignments", type=Path, default=DEFAULT_ASSIGNMENTS)
    p.add_argument("--geoarba", nargs="+", type=Path, default=DEFAULT_GEOARBA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    return p.parse_args()


def load_json(path: Path):
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            return json.load(fh)
    return json.loads(path.read_text(encoding="utf-8"))


def productivo_set(path: Path) -> set[str]:
    data = load_json(path)
    vals = data.get("zones", {}).get("productiva", [])
    out = set()
    for x in vals:
        if isinstance(x, str): out.add(x)
        elif isinstance(x, dict):
            n = x.get("nomenclatura") or x.get("id")
            if n: out.add(str(n))
    return out


def load_parcels(paths, productivo):
    rows = []
    for path in paths:
        data = load_json(path)
        for feat in data.get("features", []):
            try: g = shape(feat["geometry"])
            except Exception: continue
            if g.is_empty: continue
            p = feat.get("properties") or {}
            n = str(p.get("nomenclatura") or "")
            rows.append({"geom": g, "nomenclatura": n, "partida": str(p.get("partida") or ""), "productivo": n in productivo})
    return rows


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"})
    with urllib.request.urlopen(req, timeout=25) as r:
        raw = r.read(5_000_000)
        return raw.decode(r.headers.get_content_charset() or "utf-8", errors="ignore")


def candidates(html: str):
    out = []
    for pi, pat in enumerate(PATTERNS):
        for m in pat.finditer(html):
            lat, lon = float(m.group(1)), float(m.group(2))
            if LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX:
                out.append((lat, lon, pi))
    # dedup aproximado
    seen = set(); dedup = []
    for lat, lon, pi in out:
        k = (round(lat, 6), round(lon, 6))
        if k not in seen:
            seen.add(k); dedup.append((lat, lon, pi))
    return dedup


def containing(point: Point, parcels):
    return [r for r in parcels if r["geom"].covers(point)]


def main():
    a = args(); a.output_dir.mkdir(parents=True, exist_ok=True)
    evidence = load_json(a.evidence)
    prod = productivo_set(a.assignments)
    parcels = load_parcels(a.geoarba, prod)
    rows = []
    for project in evidence.get("projects", []):
        project_id = project.get("id")
        name = project.get("name")
        found = []
        for source in project.get("sources", []):
            url = source.get("url")
            if not url: continue
            err = ""
            try:
                html = fetch(url)
                cs = candidates(html)
            except Exception as exc:
                cs = []; err = str(exc)
            for lat, lon, pattern_index in cs:
                p = Point(lon, lat)
                hits = containing(p, parcels)
                found.append({
                    "project_id": project_id, "project_name": name, "source": source.get("source"), "url": url,
                    "lat": lat, "lon": lon, "pattern_index": pattern_index,
                    "containing_geoarba": [{"nomenclatura": h["nomenclatura"], "partida": h["partida"], "productivo": h["productivo"]} for h in hits],
                    "containing_productivo": any(h["productivo"] for h in hits), "fetch_error": err,
                })
            if not cs and err:
                found.append({"project_id": project_id, "project_name": name, "source": source.get("source"), "url": url, "lat": None, "lon": None, "pattern_index": None, "containing_geoarba": [], "containing_productivo": False, "fetch_error": err})
        # conservar todos los candidatos para auditoría; no elegir silenciosamente uno.
        rows.extend(found)

    csv_path = a.output_dir / "public-commercial-source-coordinates.csv"
    fields = ["project_id","project_name","source","url","lat","lon","pattern_index","containing_productivo","containing_geoarba","fetch_error"]
    with csv_path.open("w", newline="", encoding="utf-8-sig") as fh:
        wr = csv.DictWriter(fh, fieldnames=fields); wr.writeheader()
        for r in rows:
            rr = dict(r); rr["containing_geoarba"] = json.dumps(rr["containing_geoarba"], ensure_ascii=False); wr.writerow(rr)

    projects = evidence.get("projects", [])
    resolved_projects = sorted({r["project_id"] for r in rows if r.get("lat") is not None})
    inside_projects = sorted({r["project_id"] for r in rows if r.get("containing_productivo")})
    qa = {
        "projects": len(projects),
        "projects_with_source_coordinate_candidate": len(resolved_projects),
        "projects_with_candidate_inside_productivo": len(inside_projects),
        "coordinate_candidates": sum(r.get("lat") is not None for r in rows),
        "fetch_errors": sum(bool(r.get("fetch_error")) for r in rows),
        "resolved_project_ids": resolved_projects,
        "inside_productivo_project_ids": inside_projects,
        "warning": "Source-page coordinates are commercial map anchors only. Multiple coordinates may exist per page; human/cadastral QA required before linking a project polygon.",
    }
    qa_path = a.output_dir / "public-commercial-source-coordinate-qa.json"
    qa_path.write_text(json.dumps(qa, indent=2, ensure_ascii=False), encoding="utf-8")
    print("=== PUBLIC COMMERCIAL SOURCE COORDINATE QA ===")
    print(json.dumps(qa, indent=2, ensure_ascii=False))
    for r in rows:
        if r.get("lat") is not None:
            print(f"{r['project_id']} | {r['lat']} {r['lon']} | productivo={r['containing_productivo']} | {r['containing_geoarba']}")
    print(f"csv={csv_path}")
    print(f"qa={qa_path}")

if __name__ == "__main__":
    main()
