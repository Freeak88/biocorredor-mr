#!/usr/bin/env python3
"""Genera paneles visuales de QA para segmentación de superficie construida.

Produce:
- comparación central de umbrales 0.30 / 0.4371 / 0.60;
- overlay del umbral primario;
- panel original / probabilidad / máscara primaria.

No modifica datos fuente ni cuantifica m².
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--image", type=Path, required=True)
    p.add_argument("--seg-dir", type=Path, required=True)
    p.add_argument("--date", required=True, help="YYYY-MM-DD")
    p.add_argument("--crop-size", type=int, default=1200)
    return p.parse_args()


def read_required(path: Path, flags=cv2.IMREAD_COLOR):
    im = cv2.imread(str(path), flags)
    if im is None:
        raise SystemExit(f"No se pudo leer: {path}")
    return im


def center_crop(im: np.ndarray, size: int) -> np.ndarray:
    h, w = im.shape[:2]
    size = min(size, h, w)
    x0 = max(0, w // 2 - size // 2)
    y0 = max(0, h // 2 - size // 2)
    return im[y0:y0 + size, x0:x0 + size].copy()


def overlay_mask(src: np.ndarray, mask: np.ndarray) -> np.ndarray:
    out = src.copy()
    idx = mask > 0
    red_bgr = np.array([0, 0, 255], dtype=np.float32)
    out[idx] = (
        out[idx].astype(np.float32) * 0.45 + red_bgr * 0.55
    ).astype(np.uint8)
    return out


def label(im: np.ndarray, text: str) -> np.ndarray:
    out = im.copy()
    cv2.putText(out, text, (28, 52), cv2.FONT_HERSHEY_SIMPLEX, 1.15,
                (255, 255, 255), 5, cv2.LINE_AA)
    cv2.putText(out, text, (28, 52), cv2.FONT_HERSHEY_SIMPLEX, 1.15,
                (0, 0, 0), 2, cv2.LINE_AA)
    return out


def ensure_bgr(gray: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR) if gray.ndim == 2 else gray


def main():
    a = parse_args()
    src = read_required(a.image)
    seg = a.seg_dir
    stem = a.date

    configs = [
        ("t0300", "threshold 0.30"),
        ("t0437", "threshold 0.4371"),
        ("t0600", "threshold 0.60"),
    ]

    threshold_panels = []
    for tag, title in configs:
        mask = read_required(seg / f"{stem}-building-mask-{tag}.png", cv2.IMREAD_GRAYSCALE)
        ov = center_crop(overlay_mask(src, mask), a.crop_size)
        threshold_panels.append(label(ov, title))

    comparison = np.hstack(threshold_panels)
    comparison_path = seg / f"{stem}-threshold-comparison-center.jpg"
    cv2.imwrite(str(comparison_path), comparison, [cv2.IMWRITE_JPEG_QUALITY, 95])

    primary = read_required(seg / f"{stem}-building-mask.png", cv2.IMREAD_GRAYSCALE)
    primary_overlay = overlay_mask(src, primary)
    primary_overlay_path = seg / f"{stem}-overlay.jpg"
    cv2.imwrite(str(primary_overlay_path), primary_overlay, [cv2.IMWRITE_JPEG_QUALITY, 94])

    primary_center_path = seg / f"{stem}-overlay-center.jpg"
    cv2.imwrite(str(primary_center_path), center_crop(primary_overlay, a.crop_size),
                [cv2.IMWRITE_JPEG_QUALITY, 95])

    prob = read_required(seg / f"{stem}-building-prob.png", cv2.IMREAD_GRAYSCALE)
    original_crop = label(center_crop(src, a.crop_size), "original")
    prob_crop = label(ensure_bgr(center_crop(prob, a.crop_size)), "building probability")
    mask_crop = label(ensure_bgr(center_crop(primary, a.crop_size)), "mask 0.4371")
    diagnostic = np.hstack([original_crop, prob_crop, mask_crop])
    diagnostic_path = seg / f"{stem}-diagnostic-center.jpg"
    cv2.imwrite(str(diagnostic_path), diagnostic, [cv2.IMWRITE_JPEG_QUALITY, 95])

    print(comparison_path)
    print(primary_overlay_path)
    print(primary_center_path)
    print(diagnostic_path)


if __name__ == "__main__":
    main()
