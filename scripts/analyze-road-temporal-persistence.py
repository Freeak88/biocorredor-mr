#!/usr/bin/env python3
"""Analiza persistencia/aparición temporal de Road (OpenEarthMap) en Cluster 2.

Entrada esperada: salidas `road-argmax.png` de las cinco fechas ya inferidas con
`scripts/road-semantic-openearthmap.py`.

Objetivo: construir una capa diagnóstica de persistencia vial con tolerancia
espacial por registro. No es una máscara final ni un indicador jurídico.
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

DATES = ["2016-11-30", "2020-03-03", "2022-03-01", "2023-04-19", "2026-01-11"]
DEFAULT_SEMANTIC_ROOT = v2.HISTORY_ROOT / "road-semantic-openearthmap"
DEFAULT_OUTPUT = v2.HISTORY_ROOT / "road-temporal-persistence"

# Tolerancia conservadora en píxeles para absorber residuales de co-registro.
# 2020 recibe más margen por su p95 residual ~2.7 px; 2016 ~1 px; 2022/2026 son
# prácticamente subpíxel respecto de 2023.
MATCH_RADIUS = {
    "2016-11-30": 2,
    "2020-03-03": 4,
    "2022-03-01": 1,
    "2023-04-19": 1,
    "2026-01-11": 1,
}

CLASS_ID = {
    "none": 0,
    "persistent_pre2020": 1,
    "new_2022_2023_candidate": 2,
    "new_2026_candidate": 3,
    "intermittent_or_disappeared": 4,
    "uncertain": 5,
}

# BGR para overlays.
CLASS_COLOR = {
    1: np.array([255, 255, 0], dtype=np.float32),    # cian
    2: np.array([0, 165, 255], dtype=np.float32),    # naranja
    3: np.array([0, 0, 255], dtype=np.float32),      # rojo
    4: np.array([255, 0, 255], dtype=np.float32),    # magenta
    5: np.array([128, 128, 128], dtype=np.float32),  # gris
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--semantic-root", type=Path, default=DEFAULT_SEMANTIC_ROOT)
    p.add_argument("--registered-dir", type=Path, default=v2.DEFAULT_REGISTERED)
    p.add_argument("--metadata", type=Path, default=v2.DEFAULT_META)
    p.add_argument("--productiva-mask", type=Path, default=v2.DEFAULT_PRODUCTIVA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    return p.parse_args()


def load_mask(path: Path) -> np.ndarray:
    arr = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if arr is None:
        raise FileNotFoundError(path)
    return arr > 0


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return mask.copy()
    k = 2 * radius + 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    return cv2.dilate(mask.astype(np.uint8), kernel, iterations=1) > 0


def fraction(mask: np.ndarray, valid: np.ndarray) -> float:
    return float(mask[valid].mean()) if np.any(valid) else 0.0


def main() -> None:
    args = parse_args()
    registered_dir = v2.resolve_registered_dir(args.registered_dir, DATES)

    ref_bgr = v2.read_image(registered_dir / "2026-01-11.jpg")
    h, w = ref_bgr.shape[:2]

    meta = v2.load_json(args.metadata)
    prod = v2.load_json(args.productiva_mask)
    productivo = v2.rasterize_productivo(meta, prod, (h, w))
    valid = productivo > 0
    if not np.any(valid):
        raise SystemExit("Scope Productivo vacío")

    masks: dict[str, np.ndarray] = {}
    expanded: dict[str, np.ndarray] = {}
    for date in DATES:
        path = args.semantic_root / date / "road-argmax.png"
        m = load_mask(path)
        if m.shape != (h, w):
            raise SystemExit(f"Shape inesperado en {path}: {m.shape} vs {(h, w)}")
        m &= valid
        masks[date] = m
        expanded[date] = dilate(m, MATCH_RADIUS[date]) & valid

    m16, m20, m22, m23, m26 = [masks[d] for d in DATES]
    e16, e20, e22, e23, e26 = [expanded[d] for d in DATES]

    # Analizamos la red observada en 2026 como referencia de estado actual y
    # preguntamos hacia atrás si ese mismo corredor (con tolerancia espacial)
    # ya estaba presente. Esto evita convertir variaciones finas de ancho entre
    # escenas en falsas apariciones.
    latest = m26.copy()
    pre2020_support = e16 | e20
    mid_support = e22 | e23

    persistent_pre2020 = latest & pre2020_support & mid_support
    new_2022_2023 = latest & ~pre2020_support & mid_support
    new_2026 = latest & ~pre2020_support & ~mid_support

    # Señales anteriores que no tienen soporte espacial en 2026. Pueden ser
    # falsos positivos, caminos transitorios/productivos, o trazas que realmente
    # desaparecieron. Se mantienen separadas, nunca se tratan como loteo.
    earlier_union = m16 | m20 | m22 | m23
    intermittent = earlier_union & ~e26

    # Zonas con detección en varias fechas pero sin correspondencia limpia con
    # la referencia 2026 quedan como inciertas, no se fuerzan a una clase vial.
    support_count = (
        m16.astype(np.uint8)
        + m20.astype(np.uint8)
        + m22.astype(np.uint8)
        + m23.astype(np.uint8)
        + m26.astype(np.uint8)
    )
    uncertain = (support_count >= 2) & valid
    uncertain &= ~(persistent_pre2020 | new_2022_2023 | new_2026 | intermittent)

    classes = np.zeros((h, w), dtype=np.uint8)
    classes[persistent_pre2020] = CLASS_ID["persistent_pre2020"]
    classes[new_2022_2023] = CLASS_ID["new_2022_2023_candidate"]
    classes[new_2026] = CLASS_ID["new_2026_candidate"]
    classes[intermittent] = CLASS_ID["intermittent_or_disappeared"]
    classes[uncertain] = CLASS_ID["uncertain"]
    classes[~valid] = 0

    args.output_dir.mkdir(parents=True, exist_ok=True)

    # Imagen de clases pura.
    color_map = np.zeros((h, w, 3), dtype=np.uint8)
    for cid, color in CLASS_COLOR.items():
        color_map[classes == cid] = color.astype(np.uint8)
    cv2.imwrite(str(args.output_dir / "road-temporal-classes.png"), color_map)

    # Conteo de detecciones independientes por píxel (0..5) sólo como QA.
    count_img = np.clip((support_count.astype(np.float32) / 5.0) * 255.0, 0, 255).astype(np.uint8)
    count_img[~valid] = 0
    cv2.imwrite(str(args.output_dir / "road-temporal-support-count.png"), count_img)

    # Overlay sobre 2026.
    overlay = ref_bgr.astype(np.float32).copy()
    for cid, color in CLASS_COLOR.items():
        m = classes == cid
        overlay[m] = 0.42 * overlay[m] + 0.58 * color
    cv2.imwrite(
        str(args.output_dir / "road-temporal-overlay-2026.jpg"),
        np.clip(overlay, 0, 255).astype(np.uint8),
        [cv2.IMWRITE_JPEG_QUALITY, 92],
    )

    # QA numérico. Las fracciones son del scope Productivo del Cluster 2 y NO
    # equivalen a superficie vial jurídica/administrativa ni a porcentaje loteado.
    class_fractions = {
        name: fraction(classes == cid, valid)
        for name, cid in CLASS_ID.items()
        if cid != 0
    }
    per_date = {date: fraction(masks[date], valid) for date in DATES}

    report = {
        "scope": "Productivo only",
        "reference_date": "2026-01-11",
        "dates": DATES,
        "method": "OpenEarthMap Road argmax + backward spatial matching to 2026",
        "match_radius_px": MATCH_RADIUS,
        "per_date_road_argmax_fraction_productivo": per_date,
        "class_fraction_productivo": class_fractions,
        "latest_road_fraction_productivo": fraction(latest, valid),
        "latest_fraction_with_pre2020_support": (
            float(persistent_pre2020[valid].sum() / max(1, latest[valid].sum()))
        ),
        "latest_fraction_first_supported_2022_2023": (
            float(new_2022_2023[valid].sum() / max(1, latest[valid].sum()))
        ),
        "latest_fraction_only_2026": (
            float(new_2026[valid].sum() / max(1, latest[valid].sum()))
        ),
        "status": "diagnostic temporal persistence layer",
        "warning": (
            "No usar clases/fracciones como porcentaje loteado, superficie vendida, "
            "aprobación o ilegalidad. Requiere QA visual y posterior combinación con "
            "geometría de corredores, earthwork y demás señales físicas."
        ),
    }
    qa_path = args.output_dir / "road-temporal-persistence-qa.json"
    qa_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=== ROAD TEMPORAL PERSISTENCE QA ===")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"overlay={args.output_dir / 'road-temporal-overlay-2026.jpg'}")
    print(f"classes={args.output_dir / 'road-temporal-classes.png'}")
    print(f"qa={qa_path}")


if __name__ == "__main__":
    main()
