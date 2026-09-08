#!/usr/bin/env python3
"""V5 Fase D: score híbrido de calles internas actuales dentro de Productivo.

Combina tres señales ya validadas como auxiliares en Cluster 2:
1) OpenEarthMap Road 2026 + persistencia temporal multifecha;
2) soporte geométrico V4 de corredor en 2023->2026;
3) earthwork 2023->2026 como evidencia secundaria.

No es una capa legal ni un porcentaje loteado. El resultado es un score diagnóstico
[0,1] para priorizar revisión y futura agregación parcelaria.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
V2_PATH = HERE / "generate-earthwork-road-candidates-v2.py"
spec = importlib.util.spec_from_file_location("earthwork_road_v2", V2_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"No se pudo cargar {V2_PATH}")
v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)

HISTORY_ROOT = v2.HISTORY_ROOT
DEFAULT_SEMANTIC_ROOT = HISTORY_ROOT / "road-semantic-openearthmap" / "2026-01-11"
DEFAULT_TEMPORAL_ROOT = HISTORY_ROOT / "road-temporal-persistence"
DEFAULT_V4_ROOT = HISTORY_ROOT / "road-corridor-candidates-v4"
DEFAULT_OUTPUT = HISTORY_ROOT / "internal-road-score-v5"
PAIR = "2023-04-19_to_2026-01-11"

# Colores BGR exactos usados por analyze-road-temporal-persistence.py
TEMPORAL_COLOR_TO_WEIGHT = {
    (255, 255, 0): 0.95,   # persistent_pre2020
    (0, 165, 255): 0.86,   # new_2022_2023_candidate
    (0, 0, 255): 0.58,     # new_2026_candidate
    (255, 0, 255): 0.20,   # intermittent_or_disappeared
    (128, 128, 128): 0.35, # uncertain
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--semantic-root", type=Path, default=DEFAULT_SEMANTIC_ROOT)
    p.add_argument("--temporal-root", type=Path, default=DEFAULT_TEMPORAL_ROOT)
    p.add_argument("--v4-root", type=Path, default=DEFAULT_V4_ROOT)
    p.add_argument("--registered-dir", type=Path, default=v2.DEFAULT_REGISTERED)
    p.add_argument("--metadata", type=Path, default=v2.DEFAULT_META)
    p.add_argument("--productiva-mask", type=Path, default=v2.DEFAULT_PRODUCTIVA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--support-radius-px", type=int, default=2)
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


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return mask.copy()
    k = 2 * radius + 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    return cv2.dilate(mask.astype(np.uint8), kernel, iterations=1) > 0


def temporal_weight_from_color(img: np.ndarray) -> np.ndarray:
    out = np.zeros(img.shape[:2], dtype=np.float32)
    for color, weight in TEMPORAL_COLOR_TO_WEIGHT.items():
        b, g, r = color
        m = (img[:, :, 0] == b) & (img[:, :, 1] == g) & (img[:, :, 2] == r)
        out[m] = weight
    return out


def save_gray(path: Path, arr01: np.ndarray) -> None:
    cv2.imwrite(str(path), np.clip(arr01 * 255.0, 0, 255).astype(np.uint8))


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    registered_dir = v2.resolve_registered_dir(args.registered_dir, ["2026-01-11"])
    ref = v2.read_image(registered_dir / "2026-01-11.jpg")
    h, w = ref.shape[:2]

    meta = v2.load_json(args.metadata)
    prod = v2.load_json(args.productiva_mask)
    productivo = v2.rasterize_productivo(meta, prod, (h, w))
    valid = productivo > 0
    if not np.any(valid):
        raise SystemExit("Scope Productivo vacío")

    road_argmax = read_gray(args.semantic_root / "road-argmax.png") > 0
    road_prob = read_gray(args.semantic_root / "road-probability.png").astype(np.float32) / 255.0
    temporal_img = read_color(args.temporal_root / "road-temporal-classes.png")
    corridor = read_gray(args.v4_root / f"{PAIR}-corridor-strong.png") > 0
    earth = read_gray(args.v4_root / f"{PAIR}-earthwork-strong.png") > 0

    for name, arr in {
        "road_argmax": road_argmax,
        "road_prob": road_prob,
        "temporal": temporal_img[:, :, 0],
        "corridor": corridor,
        "earth": earth,
    }.items():
        if arr.shape != (h, w):
            raise SystemExit(f"Shape inesperado {name}: {arr.shape} vs {(h, w)}")

    road_argmax &= valid
    temporal_weight = temporal_weight_from_color(temporal_img)
    corridor_support = dilate(corridor & valid, args.support_radius_px)
    earth_support = dilate(earth & valid, args.support_radius_px)

    score = (
        0.55 * temporal_weight
        + 0.30 * road_prob
        + 0.10 * corridor_support.astype(np.float32)
        + 0.05 * earth_support.astype(np.float32)
    )

    # El score de calle actual sólo puede existir donde OpenEarthMap ve Road en 2026.
    # Para candidatos "sólo 2026" sin apoyo V4/earthwork aplicamos una penalización
    # moderada, porque el QA visual mostró algunos trazos de campo/parcelarios dudosos.
    is_new_2026 = np.all(temporal_img == np.array([0, 0, 255], dtype=np.uint8), axis=2)
    unsupported_new = is_new_2026 & ~corridor_support & ~earth_support
    score[unsupported_new] *= 0.70

    score[~road_argmax] = 0.0
    score[~valid] = 0.0
    score = np.clip(score, 0.0, 1.0)

    high = (score >= 0.75) & valid
    medium = (score >= 0.55) & (score < 0.75) & valid
    low = (score >= 0.35) & (score < 0.55) & valid

    save_gray(args.output_dir / "internal-road-score.png", score)
    cv2.imwrite(str(args.output_dir / "internal-road-high.png"), high.astype(np.uint8) * 255)
    cv2.imwrite(str(args.output_dir / "internal-road-medium.png"), medium.astype(np.uint8) * 255)
    cv2.imwrite(str(args.output_dir / "internal-road-low.png"), low.astype(np.uint8) * 255)

    overlay = ref.astype(np.float32).copy()
    overlay[low] = 0.55 * overlay[low] + 0.45 * np.array([0, 215, 255], np.float32)       # amarillo/naranja
    overlay[medium] = 0.45 * overlay[medium] + 0.55 * np.array([255, 255, 0], np.float32) # cian
    overlay[high] = 0.35 * overlay[high] + 0.65 * np.array([0, 255, 0], np.float32)        # verde
    cv2.imwrite(
        str(args.output_dir / "internal-road-score-overlay-2026.jpg"),
        np.clip(overlay, 0, 255).astype(np.uint8),
        [cv2.IMWRITE_JPEG_QUALITY, 92],
    )

    vals = score[valid]
    latest_n = max(1, int(road_argmax[valid].sum()))
    report = {
        "scope": "Productivo only",
        "reference_date": "2026-01-11",
        "method": "hybrid V5 = temporal OpenEarthMap persistence + 2026 Road probability + V4 corridor support + earthwork support",
        "weights": {
            "temporal": 0.55,
            "road_probability": 0.30,
            "v4_corridor_support": 0.10,
            "earthwork_support": 0.05,
        },
        "support_radius_px": args.support_radius_px,
        "road_argmax_fraction_productivo": float(road_argmax[valid].mean()),
        "high_fraction_productivo": float(high[valid].mean()),
        "medium_fraction_productivo": float(medium[valid].mean()),
        "low_fraction_productivo": float(low[valid].mean()),
        "high_fraction_of_latest_road": float(high[valid].sum() / latest_n),
        "medium_fraction_of_latest_road": float(medium[valid].sum() / latest_n),
        "low_fraction_of_latest_road": float(low[valid].sum() / latest_n),
        "score_mean_productivo": float(vals.mean()),
        "score_p95_productivo": float(np.percentile(vals, 95)),
        "unsupported_new_2026_fraction_productivo": float(unsupported_new[valid].mean()),
        "status": "diagnostic hybrid internal-road score; visual QA required before parcel aggregation",
        "warning": "No interpretar como porcentaje loteado, superficie vendida, aprobación ni ilegalidad.",
    }
    qa = args.output_dir / "internal-road-score-v5-qa.json"
    qa.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=== INTERNAL ROAD SCORE V5 QA ===")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"overlay={args.output_dir / 'internal-road-score-overlay-2026.jpg'}")
    print(f"qa={qa}")


if __name__ == "__main__":
    main()
