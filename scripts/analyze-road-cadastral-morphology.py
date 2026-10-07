#!/usr/bin/env python3
"""Cruza la señal vial V5 con la morfología parcelaria actual de GeoARBA.

Objetivo: distinguir corredores con fuerte soporte de subdivisión parcelaria de
corredores físicos que atraviesan una/few parcelas con poca estructura catastral
adyacente. Esto NO determina si una calle está declarada, aprobada o es irregular.

La idea es superar el contraste ingenuo "cerca/lejos de un límite": una calle
catastralizada suele estar acompañada por múltiples frentes/límites de parcelas a
ambos lados, mientras que una apertura interna reciente puede recorrer una parcela
madre con poca fragmentación lateral.
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import math
from collections import Counter
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
DEFAULT_OUTPUT = HISTORY_ROOT / "road-cadastral-morphology"
DEFAULT_GEOARBA = [
    Path("public/data/geoarba/ministro-rivadavia-parcels-noreste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-noroeste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-sureste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-suroeste.geojson"),
]


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
    p.add_argument("--min-component-px", type=int, default=24)
    p.add_argument("--context-radius-px", type=int, default=18)
    p.add_argument("--boundary-radius-px", type=int, default=8)
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


def load_parcel_labels(paths: list[Path], meta: dict, shape_hw: tuple[int, int]) -> tuple[np.ndarray, dict[int, str], int]:
    h, w = shape_hw
    labels = np.zeros((h, w), dtype=np.int32)
    id_to_name: dict[int, str] = {}
    seen: dict[str, int] = {}
    total = 0
    next_id = 1
    for path in paths:
        data = v2.load_json(path)
        for feature in data.get("features", []):
            total += 1
            props = feature.get("properties", {})
            name = str(props.get("nomenclatura") or props.get("partida") or f"feature-{total}")
            if name in seen:
                value = seen[name]
            else:
                value = next_id
                next_id += 1
                seen[name] = value
                id_to_name[value] = name
            try:
                geom = shape(feature["geometry"])
                draw_geom_label(labels, geom, value, meta)
            except Exception:
                continue
    return labels, id_to_name, total


def parcel_boundaries(label_img: np.ndarray) -> np.ndarray:
    b = np.zeros(label_img.shape, dtype=np.uint8)
    b[:, 1:] |= (label_img[:, 1:] != label_img[:, :-1]).astype(np.uint8)
    b[1:, :] |= (label_img[1:, :] != label_img[:-1, :]).astype(np.uint8)
    b[label_img == 0] = 0
    return b > 0


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return mask.copy()
    k = 2 * radius + 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    return cv2.dilate(mask.astype(np.uint8), kernel, iterations=1) > 0


def component_length_proxy(stats_row) -> float:
    w = float(stats_row[cv2.CC_STAT_WIDTH])
    h = float(stats_row[cv2.CC_STAT_HEIGHT])
    return math.hypot(w, h)


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
    road = (high | medium) & productivo
    temporal = read_color(args.temporal_root / "road-temporal-classes.png")

    parcel_labels, id_to_name, total_read = load_parcel_labels(args.geoarba, meta, (h, w))
    parcel_labels[~productivo] = 0
    boundary = parcel_boundaries(parcel_labels)
    boundary_support = dilate(boundary, args.boundary_radius_px)

    n, cc, stats, _ = cv2.connectedComponentsWithStats(road.astype(np.uint8), 8)
    class_img = np.zeros((h, w), dtype=np.uint8)
    rows: list[dict] = []

    # OpenCV/BGR temporal classes: cian persistent pre2020, naranja 2022/23, rojo 2026.
    recent = (
        np.all(temporal == np.array([0, 165, 255], dtype=np.uint8), axis=2)
        | np.all(temporal == np.array([0, 0, 255], dtype=np.uint8), axis=2)
    )

    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < args.min_component_px:
            continue
        comp = cc == i
        context = dilate(comp, args.context_radius_px) & productivo
        road_labels = parcel_labels[comp]
        road_labels = road_labels[road_labels > 0]
        ctx_labels = parcel_labels[context]
        ctx_labels = ctx_labels[ctx_labels > 0]
        road_counts = Counter(map(int, road_labels.tolist()))
        ctx_unique = np.unique(ctx_labels) if ctx_labels.size else np.array([], dtype=np.int32)
        dominant_fraction = 0.0 if not road_counts else max(road_counts.values()) / max(1, len(road_labels))
        boundary_fraction = float(boundary_support[comp].mean())
        context_unique = int(len(ctx_unique))
        length_px = component_length_proxy(stats[i])
        recent_fraction = float(recent[comp].mean())

        # Soporte morfológico: múltiples parcelas vecinas + proximidad a frentes/límites.
        # Un corredor largo dominado por una sola parcela, con poca estructura lateral,
        # es un candidato de baja correspondencia catastral morfológica.
        parcel_diversity = min(context_unique / 8.0, 1.0)
        morphology_support = 0.58 * parcel_diversity + 0.42 * min(boundary_fraction / 0.45, 1.0)
        low_support_score = (1.0 - morphology_support) * (0.55 + 0.45 * dominant_fraction)
        if length_px < 45:
            cls = 4  # pequeño/incierto
        elif low_support_score >= 0.68 and context_unique <= 4:
            cls = 3  # baja correspondencia morfológica
        elif morphology_support >= 0.62 or context_unique >= 7:
            cls = 1  # soporte catastral fuerte
        else:
            cls = 2  # transición
        class_img[comp] = cls

        dominant_id = road_counts.most_common(1)[0][0] if road_counts else 0
        rows.append({
            "component_id": i,
            "class": {1:"cadastral_morphology_supported",2:"transitional",3:"low_cadastral_morphology_support",4:"small_uncertain"}[cls],
            "area_px": area,
            "length_proxy_px": round(length_px, 2),
            "approx_length_proxy_m": round(length_px * 0.489912586, 2),
            "road_distinct_parcels": len(road_counts),
            "context_unique_parcels": context_unique,
            "dominant_parcel_fraction": round(dominant_fraction, 4),
            "dominant_nomenclatura": id_to_name.get(dominant_id, ""),
            "boundary_support_fraction": round(boundary_fraction, 4),
            "morphology_support": round(morphology_support, 4),
            "low_support_score": round(low_support_score, 4),
            "recent_2022plus_fraction": round(recent_fraction, 4),
        })

    rows.sort(key=lambda r: (r["class"] != "low_cadastral_morphology_support", -r["low_support_score"], -r["length_proxy_px"]))
    csv_path = args.output_dir / "road-cadastral-morphology-components.csv"
    if rows:
        with csv_path.open("w", newline="", encoding="utf-8-sig") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            wr.writeheader(); wr.writerows(rows)

    overlay = ref.astype(np.float32).copy()
    colors = {
        1: np.array([0, 255, 0], np.float32),      # verde
        2: np.array([0, 165, 255], np.float32),    # naranja
        3: np.array([0, 0, 255], np.float32),      # rojo
        4: np.array([255, 0, 255], np.float32),    # magenta
    }
    for cls, color in colors.items():
        m = class_img == cls
        overlay[m] = 0.30 * overlay[m] + 0.70 * color
    # límites GeoARBA finos para contexto
    overlay[boundary & productivo] = 0.45 * overlay[boundary & productivo] + 0.55 * np.array([255,255,0], np.float32)
    out_overlay = args.output_dir / f"road-cadastral-morphology-overlay-{args.date}.jpg"
    cv2.imwrite(str(out_overlay), np.clip(overlay,0,255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])

    detected_n = max(1, int(road.sum()))
    report = {
        "scope": "Productivo only within Cluster 2 coverage",
        "reference_date": args.date,
        "method": "V5 HIGH+MEDIUM components classified by GeoARBA parcel morphology around each corridor",
        "interpretation": "morphological cadastral support, not legal/declaration status",
        "context_radius_px": args.context_radius_px,
        "boundary_radius_px": args.boundary_radius_px,
        "geoarba_features_total_read": total_read,
        "components_analyzed": len(rows),
        "detected_high_medium_fraction_productivo": float(road[productivo].mean()),
        "supported_fraction_of_detected": float(((class_img==1)&road).sum()/detected_n),
        "transitional_fraction_of_detected": float(((class_img==2)&road).sum()/detected_n),
        "low_cadastral_morphology_support_fraction_of_detected": float(((class_img==3)&road).sum()/detected_n),
        "small_uncertain_fraction_of_detected": float(((class_img==4)&road).sum()/detected_n),
        "low_support_components": sum(r["class"]=="low_cadastral_morphology_support" for r in rows),
        "status": "diagnostic cadastral morphology contrast; visual QA required",
        "warning": "Baja correspondencia morfológica no significa calle no declarada, irregular o ilegal. Prioriza corredores físicos con poca fragmentación parcelaria adyacente para revisión administrativa.",
    }
    qa = args.output_dir / "road-cadastral-morphology-qa.json"
    qa.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=== ROAD CADASTRAL MORPHOLOGY QA ===")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"overlay={out_overlay}")
    print(f"qa={qa}")
    print(f"components={csv_path}")


if __name__ == "__main__":
    main()
