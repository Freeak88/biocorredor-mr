#!/usr/bin/env python3
"""V3 de candidatos Fase D: conserva earthwork V2 y corrige la señal de calles.

La V2 seleccionaba `road_score` por percentil global. Con `road_percentile=96`, eso
forzaba aproximadamente 4% de píxeles Productivo como candidatos antes del filtro
de componentes, aunque la evidencia lineal fuese débil. V3 evita ese artefacto:

1. exige earthwork alto;
2. exige soporte Hough mínimo;
3. calcula el percentil de road_score sólo dentro de ese subconjunto elegible;
4. reporta por separado fracción elegible y fracción final.

Sigue siendo un generador de candidatos para QA humano. No clasifica loteo,
aprobación, venta ni legalidad.
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

DEFAULT_OUTPUT = v2.HISTORY_ROOT / "earthwork-road-candidates-v3"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--registered-dir", type=Path, default=v2.DEFAULT_REGISTERED)
    p.add_argument("--metadata", type=Path, default=v2.DEFAULT_META)
    p.add_argument("--productiva-mask", type=Path, default=v2.DEFAULT_PRODUCTIVA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--dates", nargs="+", default=v2.DEFAULT_DATES)
    p.add_argument("--earthwork-percentile", type=float, default=97.0)
    p.add_argument("--road-earthwork-gate-percentile", type=float, default=92.0)
    p.add_argument("--road-line-support-min", type=float, default=0.20)
    p.add_argument("--road-score-percentile", type=float, default=90.0,
                   help="Percentil calculado sólo entre píxeles elegibles para road")
    p.add_argument("--min-component-px", type=int, default=24)
    return p.parse_args()


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    meta = v2.load_json(args.metadata)
    prod = v2.load_json(args.productiva_mask)
    registered_dir = v2.resolve_registered_dir(args.registered_dir, args.dates)

    images = {d: v2.read_image(registered_dir / f"{d}.jpg") for d in args.dates}
    shape_hw = next(iter(images.values())).shape[:2]
    if any(img.shape[:2] != shape_hw for img in images.values()):
        raise SystemExit("Los mosaicos registrados no tienen dimensiones consistentes")

    productivo = v2.rasterize_productivo(meta, prod, shape_hw)
    valid = productivo > 0
    if not np.any(valid):
        raise SystemExit("Scope Productivo vacío")

    report = {
        "scope": "Productivo only",
        "registered_dir": str(registered_dir),
        "method": "directional V3: earthwork V2 + gated linear road candidates",
        "road_gate": {
            "earthwork_gate_percentile": args.road_earthwork_gate_percentile,
            "line_support_min": args.road_line_support_min,
            "road_score_percentile_within_eligible": args.road_score_percentile,
        },
        "warning": "Candidate generator only; no automatic loteo/legal classification.",
        "pairs": [],
    }

    for old_d, new_d in zip(args.dates[:-1], args.dates[1:]):
        old = images[old_d]
        new = images[new_d]

        old_exg = v2.exg(old)
        new_exg = v2.exg(new)
        veg_loss = np.maximum(old_exg - new_exg, 0.0)
        veg_loss_s = v2.robust01(veg_loss, valid, 55, 97)
        low_veg = np.clip(1.0 - v2.robust01(new_exg, valid, 30, 80), 0.0, 1.0)
        soil_s = v2.robust01(v2.redness(new), valid, 55, 95)

        old_g = v2.gradient_mag(cv2.cvtColor(old, cv2.COLOR_BGR2GRAY))
        new_gray = cv2.cvtColor(new, cv2.COLOR_BGR2GRAY)
        new_g = v2.gradient_mag(new_gray)
        structure_gain = np.maximum(new_g - old_g, 0.0)
        structure_s = v2.robust01(structure_gain, valid, 55, 97)

        earth_score = (
            0.46 * veg_loss_s
            + 0.24 * low_veg
            + 0.18 * soil_s
            + 0.12 * structure_s
        )
        earth_score[~valid] = 0.0

        e_thr = float(np.percentile(earth_score[valid], args.earthwork_percentile))
        earth = ((earth_score >= e_thr) & valid).astype(np.uint8) * 255

        line_support = v2.hough_line_support(new_gray, valid)
        road_score = earth_score * (0.35 + 0.65 * line_support)
        road_score[~valid] = 0.0

        road_earth_thr = float(np.percentile(
            earth_score[valid], args.road_earthwork_gate_percentile
        ))
        eligible = (
            valid
            & (earth_score >= road_earth_thr)
            & (line_support >= args.road_line_support_min)
        )
        eligible_values = road_score[eligible]
        if eligible_values.size >= 50:
            r_thr = float(np.percentile(eligible_values, args.road_score_percentile))
            road = (eligible & (road_score >= r_thr)).astype(np.uint8) * 255
        else:
            r_thr = None
            road = np.zeros_like(productivo)

        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        earth = cv2.morphologyEx(earth, cv2.MORPH_OPEN, k)
        earth = cv2.morphologyEx(earth, cv2.MORPH_CLOSE, k)
        road = cv2.morphologyEx(road, cv2.MORPH_CLOSE, k)
        earth, e_components = v2.filter_components(earth, args.min_component_px)
        road, r_components = v2.filter_components(road, args.min_component_px)

        stem = f"{old_d}_to_{new_d}"
        cv2.imwrite(
            str(args.output_dir / f"{stem}-earthwork-score.png"),
            v2.colorize(earth_score, valid),
        )
        cv2.imwrite(str(args.output_dir / f"{stem}-earthwork-strong.png"), earth)
        cv2.imwrite(
            str(args.output_dir / f"{stem}-road-score.png"),
            v2.colorize(road_score, valid),
        )
        cv2.imwrite(str(args.output_dir / f"{stem}-road-strong.png"), road)
        cv2.imwrite(
            str(args.output_dir / f"{stem}-overlay.jpg"),
            v2.overlay(new, earth, road),
            [cv2.IMWRITE_JPEG_QUALITY, 92],
        )

        row = {
            "from": old_d,
            "to": new_d,
            "earthwork_threshold": e_thr,
            "earthwork_fraction_productivo": float((earth[valid] > 0).mean()),
            "earthwork_components": int(e_components),
            "road_earthwork_gate_threshold": road_earth_thr,
            "road_line_support_min": args.road_line_support_min,
            "road_eligible_fraction_productivo": float(eligible[valid].mean()),
            "road_threshold_within_eligible": r_thr,
            "road_fraction_productivo": float((road[valid] > 0).mean()),
            "road_components": int(r_components),
        }
        report["pairs"].append(row)
        print(
            f"{stem}: earth={row['earthwork_fraction_productivo']:.4f} "
            f"({e_components} comp) road_eligible={row['road_eligible_fraction_productivo']:.4f} "
            f"road={row['road_fraction_productivo']:.4f} ({r_components} comp)"
        )

    out = args.output_dir / "earthwork-road-candidates-v3-qa.json"
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nQA: {out}")
    print(f"OUTPUT: {args.output_dir}")


if __name__ == "__main__":
    main()
