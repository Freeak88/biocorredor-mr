#!/usr/bin/env python3
"""V4 Fase D: candidatos de corredores/calles internas dentro de Productivo.

Motivacion
----------
V3 trataba la calle como una coleccion de bordes/lineas Hough. El QA visual mostro
que esa representacion era demasiado conservadora: perdia corredores viales
completos y podia conservar bordes de techos/invernaderos.

V4 cambia la unidad de deteccion: busca *superficies lineales de ancho finito* y
continuidad espacial. Combina:

1. baja vegetacion en la fecha nueva;
2. tendencia a suelo expuesto;
3. textura relativamente uniforme (penaliza cubiertas con mucha estructura);
4. evidencia temporal de earthwork, pero como apoyo y no como requisito duro;
5. soporte morfologico de corredores en multiples orientaciones;
6. penalizacion por alta densidad de bordes locales.

No clasifica loteo, calle aprobada, dominio, venta ni legalidad. Genera candidatos
para QA humano. Earthwork se conserva como subcapa separada.
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

DEFAULT_OUTPUT = v2.HISTORY_ROOT / "road-corridor-candidates-v4"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--registered-dir", type=Path, default=v2.DEFAULT_REGISTERED)
    p.add_argument("--metadata", type=Path, default=v2.DEFAULT_META)
    p.add_argument("--productiva-mask", type=Path, default=v2.DEFAULT_PRODUCTIVA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--dates", nargs="+", default=v2.DEFAULT_DATES)
    p.add_argument("--earthwork-percentile", type=float, default=97.0)
    p.add_argument("--surface-percentile", type=float, default=72.0,
                   help="Percentil de road-surface usado antes del soporte de corredor")
    p.add_argument("--corridor-percentile", type=float, default=96.0,
                   help="Percentil final dentro de pixeles con soporte morfologico")
    p.add_argument("--corridor-length", type=int, default=31)
    p.add_argument("--corridor-width", type=int, default=5)
    p.add_argument("--min-component-px", type=int, default=40)
    return p.parse_args()


def local_std(gray: np.ndarray, ksize: int = 9) -> np.ndarray:
    f = gray.astype(np.float32) / 255.0
    mean = cv2.boxFilter(f, cv2.CV_32F, (ksize, ksize), normalize=True)
    mean2 = cv2.boxFilter(f * f, cv2.CV_32F, (ksize, ksize), normalize=True)
    var = np.maximum(mean2 - mean * mean, 0.0)
    return np.sqrt(var)


def edge_density(gray: np.ndarray, valid: np.ndarray, ksize: int = 11) -> np.ndarray:
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 55, 140)
    e = (edges > 0).astype(np.float32)
    density = cv2.boxFilter(e, cv2.CV_32F, (ksize, ksize), normalize=True)
    density[~valid] = 0.0
    return density


def oriented_kernel(length: int, width: int, angle: float) -> np.ndarray:
    size = int(max(length, width) * 1.5)
    if size % 2 == 0:
        size += 1
    k = np.zeros((size, size), dtype=np.uint8)
    cx = cy = size // 2
    x0 = cx - length // 2
    x1 = cx + (length + 1) // 2
    y0 = cy - width // 2
    y1 = cy + (width + 1) // 2
    cv2.rectangle(k, (x0, y0), (x1, y1), 1, -1)
    if angle % 180 == 0:
        return k
    M = cv2.getRotationMatrix2D((cx, cy), angle, 1.0)
    return cv2.warpAffine(k, M, (size, size), flags=cv2.INTER_NEAREST)


def corridor_support(surface_mask: np.ndarray, length: int, width: int) -> np.ndarray:
    """Devuelve soporte [0,1] de estructuras alargadas en multiples orientaciones."""
    support = np.zeros(surface_mask.shape, dtype=np.float32)
    for angle in (0, 30, 60, 90, 120, 150):
        k = oriented_kernel(length, width, angle)
        opened = cv2.morphologyEx(surface_mask, cv2.MORPH_OPEN, k)
        # Recupera el ancho local alrededor del eje detectado sin inflar demasiado.
        opened = cv2.dilate(opened, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
        support = np.maximum(support, opened.astype(np.float32) / 255.0)
    return support


def overlay(img: np.ndarray, earth: np.ndarray, corridor: np.ndarray) -> np.ndarray:
    out = img.copy().astype(np.float32)
    red = earth > 0
    cyan = corridor > 0
    out[red] = 0.62 * out[red] + 0.38 * np.array([20, 20, 255], np.float32)
    out[cyan] = 0.38 * out[cyan] + 0.62 * np.array([255, 255, 0], np.float32)
    return np.clip(out, 0, 255).astype(np.uint8)


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
        raise SystemExit("Scope Productivo vacio")

    report = {
        "scope": "Productivo only",
        "registered_dir": str(registered_dir),
        "method": "road corridor V4: low vegetation + soil + local flatness + temporal support + multi-angle finite-width morphology",
        "parameters": {
            "surface_percentile": args.surface_percentile,
            "corridor_percentile": args.corridor_percentile,
            "corridor_length_px": args.corridor_length,
            "corridor_width_px": args.corridor_width,
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
        k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        earth = cv2.morphologyEx(earth, cv2.MORPH_OPEN, k3)
        earth = cv2.morphologyEx(earth, cv2.MORPH_CLOSE, k3)
        earth, e_components = v2.filter_components(earth, 24)

        texture = local_std(new_gray, 9)
        texture_s = v2.robust01(texture, valid, 45, 92)
        flatness = 1.0 - texture_s
        edges = edge_density(new_gray, valid, 11)
        edge_s = v2.robust01(edges, valid, 50, 95)

        # La calle no tiene por que ser una obra nueva en cada intervalo; por eso earthwork
        # pesa como evidencia temporal y no como gate duro.
        surface_score = (
            0.34 * low_veg
            + 0.24 * soil_s
            + 0.20 * flatness
            + 0.16 * v2.robust01(earth_score, valid, 55, 95)
            + 0.06 * veg_loss_s
        )
        # Techos/invernaderos tienden a tener mucha densidad de borde/estructura local.
        surface_score *= np.clip(1.0 - 0.55 * edge_s, 0.15, 1.0)
        surface_score[~valid] = 0.0

        s_thr = float(np.percentile(surface_score[valid], args.surface_percentile))
        surface_mask = ((surface_score >= s_thr) & valid).astype(np.uint8) * 255
        surface_mask = cv2.morphologyEx(surface_mask, cv2.MORPH_CLOSE, k3)

        morph_support = corridor_support(surface_mask, args.corridor_length, args.corridor_width)
        corridor_score = surface_score * (0.30 + 0.70 * morph_support)
        corridor_score[~valid] = 0.0

        eligible = valid & (morph_support > 0.0)
        vals = corridor_score[eligible]
        if vals.size >= 50:
            c_thr = float(np.percentile(vals, args.corridor_percentile))
            corridor = (eligible & (corridor_score >= c_thr)).astype(np.uint8) * 255
        else:
            c_thr = None
            corridor = np.zeros_like(productivo)

        # Conecta pequenas discontinuidades a lo largo del corredor, sin convertir puntos
        # aislados en redes enteras.
        corridor = cv2.morphologyEx(
            corridor,
            cv2.MORPH_CLOSE,
            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
        )
        corridor, c_components = v2.filter_components(corridor, args.min_component_px)

        stem = f"{old_d}_to_{new_d}"
        cv2.imwrite(str(args.output_dir / f"{stem}-earthwork-strong.png"), earth)
        cv2.imwrite(str(args.output_dir / f"{stem}-road-surface-score.png"), v2.colorize(surface_score, valid))
        cv2.imwrite(str(args.output_dir / f"{stem}-corridor-support.png"), np.clip(morph_support * 255, 0, 255).astype(np.uint8))
        cv2.imwrite(str(args.output_dir / f"{stem}-corridor-score.png"), v2.colorize(corridor_score, valid))
        cv2.imwrite(str(args.output_dir / f"{stem}-corridor-strong.png"), corridor)
        cv2.imwrite(
            str(args.output_dir / f"{stem}-overlay.jpg"),
            overlay(new, earth, corridor),
            [cv2.IMWRITE_JPEG_QUALITY, 92],
        )

        row = {
            "from": old_d,
            "to": new_d,
            "earthwork_fraction_productivo": float((earth[valid] > 0).mean()),
            "earthwork_components": int(e_components),
            "surface_threshold": s_thr,
            "corridor_support_fraction_productivo": float(eligible[valid].mean()),
            "corridor_threshold_within_support": c_thr,
            "corridor_fraction_productivo": float((corridor[valid] > 0).mean()),
            "corridor_components": int(c_components),
        }
        report["pairs"].append(row)
        print(
            f"{stem}: earth={row['earthwork_fraction_productivo']:.4f} "
            f"corridor_support={row['corridor_support_fraction_productivo']:.4f} "
            f"corridor={row['corridor_fraction_productivo']:.4f} "
            f"({c_components} comp)"
        )

    out = args.output_dir / "road-corridor-candidates-v4-qa.json"
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nQA: {out}")
    print(f"OUTPUT: {args.output_dir}")


if __name__ == "__main__":
    main()
