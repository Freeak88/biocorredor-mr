#!/usr/bin/env python3
"""Rankea corredores viales V5 que atraviesan el interior de parcelas GeoARBA actuales.

Scope duro: Productivo dentro de la cobertura real de Cluster 2.

La salida NO determina si una calle está declarada, aprobada, vendida o es irregular.
Prioriza únicamente `internal_road_within_mother_parcel_candidate`: señal vial física
HIGH+MEDIUM que penetra el interior de una parcela actual, especialmente si la
parcela es grande, el tramo es largo y existe soporte temporal reciente.
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import math
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
DEFAULT_V5_ROOT = HISTORY_ROOT / "internal-road-score-v5"
DEFAULT_TEMPORAL_ROOT = HISTORY_ROOT / "road-temporal-persistence"
DEFAULT_OUTPUT = HISTORY_ROOT / "road-within-mother-parcel"
DEFAULT_GEOARBA = [
    Path("public/data/geoarba/ministro-rivadavia-parcels-noreste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-noroeste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-sureste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-suroeste.geojson"),
]
M_PER_PX = 0.4899125860112574


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--date", default="2026-01-11")
    p.add_argument("--v5-root", type=Path, default=DEFAULT_V5_ROOT)
    p.add_argument("--temporal-root", type=Path, default=DEFAULT_TEMPORAL_ROOT)
    p.add_argument("--registered-dir", type=Path, default=v2.DEFAULT_REGISTERED)
    p.add_argument("--metadata", type=Path, default=v2.DEFAULT_META)
    p.add_argument("--productiva-mask", type=Path, default=v2.DEFAULT_PRODUCTIVA)
    p.add_argument("--geoarba", nargs="+", type=Path, default=DEFAULT_GEOARBA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--min-segment-px", type=int, default=28)
    p.add_argument("--interior-radius-px", type=int, default=16)
    p.add_argument("--min-mother-parcel-m2", type=float, default=10000.0)
    return p.parse_args()


def read_gray(path: Path) -> np.ndarray:
    arr = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if arr is None:
        raise FileNotFoundError(path)
    return arr


def read_color(path: Path) -> np.ndarray:
    arr = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if arr is None:
        raise FileNotFoundError(path)
    return arr


def draw_geom_label(label_img: np.ndarray, geom, value: int, meta: dict) -> None:
    bbox = meta["bbox_wgs84"]
    z = int(meta["zoom"])
    origin_x, origin_y = v2.lonlat_to_world_px(float(bbox[0]), float(bbox[3]), z)
    geoms = [geom] if geom.geom_type == "Polygon" else list(getattr(geom, "geoms", []))
    for poly in geoms:
        if poly.geom_type != "Polygon":
            continue
        ext = v2.polygon_to_pixels(poly.exterior.coords, origin_x, origin_y, z)
        if len(ext) >= 3:
            cv2.fillPoly(label_img, [ext], int(value))
        for ring in poly.interiors:
            hole = v2.polygon_to_pixels(ring.coords, origin_x, origin_y, z)
            if len(hole) >= 3:
                cv2.fillPoly(label_img, [hole], 0)


def load_parcels(paths: list[Path], meta: dict, shape_hw: tuple[int, int]):
    h, w = shape_hw
    labels = np.zeros((h, w), dtype=np.int32)
    id_to_props: dict[int, dict] = {}
    seen: dict[str, int] = {}
    next_id = 1
    total = 0
    for path in paths:
        data = v2.load_json(path)
        for feature in data.get("features", []):
            total += 1
            props = feature.get("properties", {})
            name = str(props.get("nomenclatura") or props.get("partida") or f"feature-{total}")
            value = seen.get(name)
            if value is None:
                value = next_id
                next_id += 1
                seen[name] = value
                id_to_props[value] = {
                    "nomenclatura": name,
                    "partida": str(props.get("partida") or ""),
                    "tipo": str(props.get("tipo") or ""),
                    "superficie_m2": float(props.get("superficie_m2") or 0.0),
                }
            try:
                draw_geom_label(labels, shape(feature["geometry"]), value, meta)
            except Exception:
                continue
    return labels, id_to_props, total


def boundaries(labels: np.ndarray) -> np.ndarray:
    out = np.zeros(labels.shape, np.uint8)
    out[:, 1:] |= (labels[:, 1:] != labels[:, :-1]).astype(np.uint8)
    out[1:, :] |= (labels[1:, :] != labels[:-1, :]).astype(np.uint8)
    out[labels == 0] = 0
    return out > 0


def length_proxy(stats_row) -> float:
    return math.hypot(float(stats_row[cv2.CC_STAT_WIDTH]), float(stats_row[cv2.CC_STAT_HEIGHT]))


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    registered_dir = v2.resolve_registered_dir(args.registered_dir, [args.date])
    ref = v2.read_image(registered_dir / f"{args.date}.jpg")
    h, w = ref.shape[:2]
    meta = v2.load_json(args.metadata)
    prod = v2.load_json(args.productiva_mask)
    productivo = v2.rasterize_productivo(meta, prod, (h, w)) > 0

    high = read_gray(args.v5_root / "internal-road-high.png") > 0
    medium = read_gray(args.v5_root / "internal-road-medium.png") > 0
    score = read_gray(args.v5_root / "internal-road-score.png").astype(np.float32) / 255.0
    road = (high | medium) & productivo
    temporal = read_color(args.temporal_root / "road-temporal-classes.png")
    recent = (
        np.all(temporal == np.array([0, 165, 255], np.uint8), axis=2)
        | np.all(temporal == np.array([0, 0, 255], np.uint8), axis=2)
    )

    parcel_labels, id_to_props, total_read = load_parcels(args.geoarba, meta, (h, w))
    parcel_labels[~productivo] = 0
    bnd = boundaries(parcel_labels)

    class_img = np.zeros((h, w), np.uint8)
    rows: list[dict] = []

    parcel_ids = np.unique(parcel_labels[road])
    parcel_ids = parcel_ids[parcel_ids > 0]
    for pid in parcel_ids:
        pmask = parcel_labels == int(pid)
        props = id_to_props.get(int(pid), {})
        parcel_area_m2 = float(props.get("superficie_m2") or 0.0)
        road_in = road & pmask
        if not np.any(road_in):
            continue

        # Distancia al borde del polígono en píxeles. Un tramo profundo en una parcela
        # grande es más compatible con corredor físico interno a parcela madre.
        dist = cv2.distanceTransform(pmask.astype(np.uint8), cv2.DIST_L2, 5)
        deep = dist >= float(args.interior_radius_px)

        n, cc, stats, _ = cv2.connectedComponentsWithStats(road_in.astype(np.uint8), 8)
        for i in range(1, n):
            area_px = int(stats[i, cv2.CC_STAT_AREA])
            if area_px < args.min_segment_px:
                continue
            comp = cc == i
            lp = length_proxy(stats[i])
            deep_fraction = float(deep[comp].mean())
            recent_fraction = float(recent[comp].mean())
            mean_score = float(score[comp].mean())
            max_depth_px = float(dist[comp].max())

            length_norm = min(lp / 180.0, 1.0)
            area_norm = min(parcel_area_m2 / 50000.0, 1.0)
            depth_norm = min(max_depth_px / 40.0, 1.0)
            priority = (
                0.30 * deep_fraction
                + 0.20 * length_norm
                + 0.18 * area_norm
                + 0.17 * recent_fraction
                + 0.10 * mean_score
                + 0.05 * depth_norm
            )

            eligible_mother = parcel_area_m2 >= args.min_mother_parcel_m2
            if eligible_mother and lp >= 70 and deep_fraction >= 0.55 and priority >= 0.68:
                cls = 3  # alta prioridad
            elif eligible_mother and lp >= 45 and deep_fraction >= 0.30 and priority >= 0.52:
                cls = 2  # media
            else:
                cls = 1  # baja/explicada por borde o parcela pequeña
            class_img[comp] = np.maximum(class_img[comp], cls)

            rows.append({
                "nomenclatura": props.get("nomenclatura", ""),
                "partida": props.get("partida", ""),
                "tipo": props.get("tipo", ""),
                "parcel_area_m2": round(parcel_area_m2, 2),
                "segment_area_px": area_px,
                "length_proxy_px": round(lp, 2),
                "approx_length_proxy_m": round(lp * M_PER_PX, 2),
                "deep_inside_fraction": round(deep_fraction, 4),
                "max_depth_px": round(max_depth_px, 2),
                "approx_max_depth_m": round(max_depth_px * M_PER_PX, 2),
                "recent_2022plus_fraction": round(recent_fraction, 4),
                "v5_score_mean": round(mean_score, 4),
                "priority_score": round(float(priority), 4),
                "priority_class": {1:"low",2:"medium",3:"high"}[cls],
            })

    rows.sort(key=lambda r: (-r["priority_score"], -r["approx_length_proxy_m"]))
    csv_path = args.output_dir / "road-within-mother-parcel-candidates.csv"
    if rows:
        with csv_path.open("w", newline="", encoding="utf-8-sig") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            wr.writeheader(); wr.writerows(rows)

    overlay = ref.astype(np.float32).copy()
    colors = {
        1: np.array([180,180,180], np.float32),
        2: np.array([0,165,255], np.float32),
        3: np.array([0,0,255], np.float32),
    }
    for cls, color in colors.items():
        m = class_img == cls
        overlay[m] = 0.30 * overlay[m] + 0.70 * color
    overlay[bnd & productivo] = 0.55 * overlay[bnd & productivo] + 0.45 * np.array([255,255,0], np.float32)
    out_overlay = args.output_dir / f"road-within-mother-parcel-overlay-{args.date}.jpg"
    cv2.imwrite(str(out_overlay), np.clip(overlay,0,255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY,92])

    high_rows = [r for r in rows if r["priority_class"] == "high"]
    med_rows = [r for r in rows if r["priority_class"] == "medium"]
    unique_high_parcels = sorted({r["nomenclatura"] for r in high_rows if r["nomenclatura"]})
    report = {
        "scope": "Productivo only within Cluster 2 coverage",
        "reference_date": args.date,
        "method": "V5 HIGH+MEDIUM split by current GeoARBA parcel; rank deep internal road segments inside sufficiently large parcels",
        "interpretation": "physical internal-road candidate within current mother parcel; not legal/declaration status",
        "approx_meters_per_pixel": M_PER_PX,
        "interior_radius_px": args.interior_radius_px,
        "approx_interior_radius_m": args.interior_radius_px * M_PER_PX,
        "min_mother_parcel_m2": args.min_mother_parcel_m2,
        "geoarba_features_total_read": total_read,
        "segments_analyzed": len(rows),
        "high_priority_segments": len(high_rows),
        "medium_priority_segments": len(med_rows),
        "high_priority_unique_parcels": len(unique_high_parcels),
        "top_high_priority_parcels": unique_high_parcels[:20],
        "status": "diagnostic ranking; visual QA required before administrative use",
        "warning": "Un candidato alto sólo indica corredor físico persistente/probable dentro del interior de una parcela GeoARBA actual grande. No implica calle no declarada, subdivisión aprobada, venta, irregularidad ni ilegalidad.",
    }
    qa = args.output_dir / "road-within-mother-parcel-qa.json"
    qa.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=== ROAD WITHIN MOTHER PARCEL QA ===")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"overlay={out_overlay}")
    print(f"qa={qa}")
    print(f"candidates={csv_path}")


if __name__ == "__main__":
    main()
