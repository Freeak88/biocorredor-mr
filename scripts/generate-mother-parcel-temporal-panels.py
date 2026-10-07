#!/usr/bin/env python3
"""Genera paneles temporales para parcelas madre candidatas de alta prioridad.

Usa:
- `road-within-mother-parcel-candidates.csv` para seleccionar nomenclaturas HIGH;
- las cinco imágenes registradas del Cluster 2;
- GeoARBA actual para dibujar el contorno de cada parcela;
- la señal vial V5 actual (HIGH+MEDIUM) para superponer el footprint 2026 en todas las fechas.

Objetivo: QA visual dirigido de aparición/consolidación de corredores dentro de una
parcela actual. No infiere aprobación, venta, irregularidad ni ilegalidad.
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
import json
from pathlib import Path

import cv2
import numpy as np
from shapely.geometry import shape

HERE = Path(__file__).resolve().parent
V2_PATH = HERE / "generate-earthwork-road-candidates-v2.py"
spec = importlib.util.spec_from_file_location("earthwork_road_v2", V2_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"No se pudo cargar {V2_PATH}")
v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)

HISTORY_ROOT = v2.HISTORY_ROOT
DEFAULT_REGISTERED = HISTORY_ROOT / "registered-local"
DEFAULT_CANDIDATES = HISTORY_ROOT / "road-within-mother-parcel" / "road-within-mother-parcel-candidates.csv"
DEFAULT_V5_ROOT = HISTORY_ROOT / "internal-road-score-v5"
DEFAULT_OUTPUT = HISTORY_ROOT / "road-within-mother-parcel" / "temporal-panels"
DEFAULT_GEOARBA = [
    Path("public/data/geoarba/ministro-rivadavia-parcels-noreste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-noroeste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-sureste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-suroeste.geojson"),
]
DATES = ["2016-11-30", "2020-03-03", "2022-03-01", "2023-04-19", "2026-01-11"]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--registered-dir", type=Path, default=DEFAULT_REGISTERED)
    p.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    p.add_argument("--v5-root", type=Path, default=DEFAULT_V5_ROOT)
    p.add_argument("--metadata", type=Path, default=v2.DEFAULT_META)
    p.add_argument("--geoarba", nargs="+", type=Path, default=DEFAULT_GEOARBA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--padding-px", type=int, default=80)
    p.add_argument("--max-parcels", type=int, default=10)
    return p.parse_args()


def read_gray(path: Path) -> np.ndarray:
    arr = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if arr is None:
        raise FileNotFoundError(path)
    return arr


def geom_to_mask(geom, meta: dict, shape_hw: tuple[int, int]) -> np.ndarray:
    h, w = shape_hw
    out = np.zeros((h, w), dtype=np.uint8)
    bbox = meta["bbox_wgs84"]
    z = int(meta["zoom"])
    origin_x, origin_y = v2.lonlat_to_world_px(float(bbox[0]), float(bbox[3]), z)
    geoms = [geom] if geom.geom_type == "Polygon" else list(getattr(geom, "geoms", []))
    for poly in geoms:
        if poly.geom_type != "Polygon":
            continue
        ext = v2.polygon_to_pixels(poly.exterior.coords, origin_x, origin_y, z)
        if len(ext) >= 3:
            cv2.fillPoly(out, [ext], 255)
        for ring in poly.interiors:
            hole = v2.polygon_to_pixels(ring.coords, origin_x, origin_y, z)
            if len(hole) >= 3:
                cv2.fillPoly(out, [hole], 0)
    return out > 0


def load_high_parcels(path: Path, max_parcels: int) -> list[dict]:
    rows: list[dict] = []
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            if row.get("priority_class") == "high":
                rows.append(row)
    rows.sort(key=lambda r: (-float(r.get("priority_score") or 0), -float(r.get("approx_length_proxy_m") or 0)))
    seen = set()
    out = []
    for row in rows:
        n = row.get("nomenclatura", "")
        if not n or n in seen:
            continue
        seen.add(n)
        out.append(row)
        if len(out) >= max_parcels:
            break
    return out


def load_geometries(paths: list[Path], wanted: set[str]) -> dict[str, tuple[object, dict]]:
    found: dict[str, tuple[object, dict]] = {}
    for path in paths:
        data = v2.load_json(path)
        for feature in data.get("features", []):
            props = feature.get("properties", {})
            n = str(props.get("nomenclatura") or "")
            if n in wanted and n not in found:
                try:
                    found[n] = (shape(feature["geometry"]), props)
                except Exception:
                    pass
    return found


def crop_bbox(mask: np.ndarray, pad: int, shape_hw: tuple[int, int]) -> tuple[int, int, int, int]:
    ys, xs = np.where(mask)
    if len(xs) == 0:
        raise ValueError("Máscara parcelaria vacía")
    h, w = shape_hw
    x0 = max(0, int(xs.min()) - pad)
    x1 = min(w, int(xs.max()) + pad + 1)
    y0 = max(0, int(ys.min()) - pad)
    y1 = min(h, int(ys.max()) + pad + 1)
    return x0, y0, x1, y1


def fit_panel(img: np.ndarray, target_h: int = 650) -> np.ndarray:
    h, w = img.shape[:2]
    scale = target_h / max(1, h)
    return cv2.resize(img, (max(1, int(round(w * scale))), target_h), interpolation=cv2.INTER_AREA)


def add_header(img: np.ndarray, text: str) -> np.ndarray:
    bar = np.full((44, img.shape[1], 3), 245, dtype=np.uint8)
    cv2.putText(bar, text, (12, 29), cv2.FONT_HERSHEY_SIMPLEX, 0.72, (20, 20, 20), 2, cv2.LINE_AA)
    return np.vstack([bar, img])


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    registered_dir = v2.resolve_registered_dir(args.registered_dir, DATES)
    images = {d: v2.read_image(registered_dir / f"{d}.jpg") for d in DATES}
    ref = images["2026-01-11"]
    h, w = ref.shape[:2]
    meta = v2.load_json(args.metadata)

    high = read_gray(args.v5_root / "internal-road-high.png") > 0
    medium = read_gray(args.v5_root / "internal-road-medium.png") > 0
    current_road = high | medium

    selected = load_high_parcels(args.candidates, args.max_parcels)
    wanted = {r["nomenclatura"] for r in selected}
    geoms = load_geometries(args.geoarba, wanted)

    report_rows = []
    for rank, row in enumerate(selected, start=1):
        nomen = row["nomenclatura"]
        if nomen not in geoms:
            continue
        geom, props = geoms[nomen]
        pmask = geom_to_mask(geom, meta, (h, w))
        road_mask = current_road & pmask
        x0, y0, x1, y1 = crop_bbox(pmask, args.padding_px, (h, w))

        boundary = cv2.morphologyEx(pmask.astype(np.uint8), cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0
        panels = []
        for d in DATES:
            img = images[d].copy().astype(np.float32)
            # mismo footprint vial 2026 sobre todas las fechas para inspeccionar si ya existía físicamente
            img[road_mask] = 0.40 * img[road_mask] + 0.60 * np.array([255, 0, 255], dtype=np.float32)
            img[boundary] = 0.20 * img[boundary] + 0.80 * np.array([255, 255, 0], dtype=np.float32)
            crop = np.clip(img[y0:y1, x0:x1], 0, 255).astype(np.uint8)
            crop = fit_panel(crop)
            crop = add_header(crop, d)
            panels.append(crop)

        max_h = max(p.shape[0] for p in panels)
        norm = []
        for p in panels:
            if p.shape[0] < max_h:
                pad = np.full((max_h - p.shape[0], p.shape[1], 3), 245, dtype=np.uint8)
                p = np.vstack([p, pad])
            norm.append(p)
        sheet = np.hstack(norm)

        title_h = 72
        title = np.full((title_h, sheet.shape[1], 3), 250, dtype=np.uint8)
        subtitle = f"#{rank} {nomen} | partida={props.get('partida','')} | prioridad={row.get('priority_score','')}"
        cv2.putText(title, subtitle, (14, 29), cv2.FONT_HERSHEY_SIMPLEX, 0.72, (15,15,15), 2, cv2.LINE_AA)
        cv2.putText(title, "cian=limite GeoARBA actual | magenta=footprint vial V5 2026 dentro de la parcela", (14, 56), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (40,40,40), 1, cv2.LINE_AA)
        sheet = np.vstack([title, sheet])

        safe = nomen.replace("/", "_")
        out = args.output_dir / f"parcel-{rank:02d}-{safe}-temporal-panel.jpg"
        cv2.imwrite(str(out), sheet, [cv2.IMWRITE_JPEG_QUALITY, 92])
        report_rows.append({
            "rank": rank,
            "nomenclatura": nomen,
            "partida": props.get("partida", ""),
            "parcel_area_m2": props.get("superficie_m2", ""),
            "priority_score": row.get("priority_score", ""),
            "approx_length_proxy_m": row.get("approx_length_proxy_m", ""),
            "deep_inside_fraction": row.get("deep_inside_fraction", ""),
            "recent_2022plus_fraction": row.get("recent_2022plus_fraction", ""),
            "panel": str(out),
        })
        print(f"panel {rank}: {out}")

    qa = {
        "scope": "Productivo only within Cluster 2 coverage",
        "dates": DATES,
        "selected_high_priority_unique_parcels": len(report_rows),
        "method": "same 2026 V5 road footprint over registered historical imagery + current GeoARBA parcel outline",
        "status": "directed visual temporal QA",
        "warning": "El footprint magenta es la señal vial 2026 proyectada hacia atras solo como guia visual. No implica que el corredor existiera en fechas anteriores.",
        "parcels": report_rows,
    }
    qa_path = args.output_dir / "mother-parcel-temporal-panels-qa.json"
    qa_path.write_text(json.dumps(qa, indent=2, ensure_ascii=False), encoding="utf-8")
    print("=== MOTHER PARCEL TEMPORAL PANELS QA ===")
    print(json.dumps(qa, indent=2, ensure_ascii=False))
    print(f"qa={qa_path}")


if __name__ == "__main__":
    main()
