#!/usr/bin/env python3
"""Diagnóstico local de desplazamiento entre mosaicos históricos y una referencia.

Divide cada mosaico YYYY-MM-DD.jpg en una grilla y estima, por tesela, el corrimiento
local respecto de la referencia usando matching normalizado sobre bordes. Esto permite
saber si el error geométrico cambia espacialmente y si una única transformación global
es insuficiente.

No modifica las imágenes. Produce CSV/JSON y una imagen vectorial de QA por fecha.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
from pathlib import Path

import cv2
import numpy as np

DATE_JPG = re.compile(r"^\d{4}-\d{2}-\d{2}\.jpg$")


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--input-dir", type=Path, required=True)
    p.add_argument("--reference", default="2023-04-19.jpg")
    p.add_argument("--output-dir", type=Path, required=True)
    p.add_argument("--grid", type=int, default=4)
    p.add_argument("--max-shift", type=int, default=24)
    p.add_argument("--min-score", type=float, default=0.20)
    p.add_argument("--inner-margin", type=int, default=40)
    return p.parse_args()


def read(path: Path):
    im = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if im is None:
        raise RuntimeError(f"No se pudo leer {path}")
    return im


def prep(im: np.ndarray) -> np.ndarray:
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    g = clahe.apply(g)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    mag = cv2.magnitude(gx, gy)
    mag = cv2.GaussianBlur(mag, (3, 3), 0)
    return cv2.normalize(mag, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)


def estimate_tile_shift(mov: np.ndarray, ref: np.ndarray, x0: int, y0: int, x1: int, y1: int,
                        max_shift: int, inner_margin: int):
    m = inner_margin
    tx0, ty0 = x0 + m, y0 + m
    tx1, ty1 = x1 - m, y1 - m
    if tx1 - tx0 < 64 or ty1 - ty0 < 64:
        raise RuntimeError("Tesela demasiado pequeña para el margen configurado")

    template = mov[ty0:ty1, tx0:tx1]
    sx0 = max(0, tx0 - max_shift)
    sy0 = max(0, ty0 - max_shift)
    sx1 = min(ref.shape[1], tx1 + max_shift)
    sy1 = min(ref.shape[0], ty1 + max_shift)
    search = ref[sy0:sy1, sx0:sx1]
    if search.shape[0] < template.shape[0] or search.shape[1] < template.shape[1]:
        raise RuntimeError("Ventana de búsqueda inválida")

    res = cv2.matchTemplate(search, template, cv2.TM_CCOEFF_NORMED)
    _, score, _, loc = cv2.minMaxLoc(res)
    matched_x = sx0 + loc[0]
    matched_y = sy0 + loc[1]
    dx = float(matched_x - tx0)
    dy = float(matched_y - ty0)
    return dx, dy, float(score)


def draw_vectors(base: np.ndarray, rows: list[dict], scale: float = 8.0) -> np.ndarray:
    out = base.copy()
    for r in rows:
        if r.get("status") != "ok":
            continue
        cx, cy = int(r["cx"]), int(r["cy"])
        dx, dy = float(r["dx_px"]), float(r["dy_px"])
        score = float(r["score"])
        end = (int(round(cx + dx * scale)), int(round(cy + dy * scale)))
        cv2.arrowedLine(out, (cx, cy), end, (0, 0, 255), 3, tipLength=0.25)
        cv2.circle(out, (cx, cy), 5, (255, 255, 255), -1)
        cv2.putText(out, f"{dx:+.1f},{dy:+.1f} s={score:.2f}", (cx + 8, cy - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 0), 3, cv2.LINE_AA)
        cv2.putText(out, f"{dx:+.1f},{dy:+.1f} s={score:.2f}", (cx + 8, cy - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)
    return out


def main():
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    ref_path = args.input_dir / args.reference
    ref_color = read(ref_path)
    ref = prep(ref_color)
    h, w = ref.shape[:2]

    files = sorted(p for p in args.input_dir.iterdir() if p.is_file() and DATE_JPG.match(p.name))
    all_rows = []
    summary = []

    for path in files:
        if path == ref_path:
            continue
        mov_color = read(path)
        if mov_color.shape[:2] != ref_color.shape[:2]:
            raise RuntimeError(f"Dimensiones distintas: {path.name} {mov_color.shape[:2]} vs {ref_color.shape[:2]}")
        mov = prep(mov_color)
        rows = []
        for gy in range(args.grid):
            for gx in range(args.grid):
                x0 = round(gx * w / args.grid)
                x1 = round((gx + 1) * w / args.grid)
                y0 = round(gy * h / args.grid)
                y1 = round((gy + 1) * h / args.grid)
                row = {
                    "file": path.name, "grid_x": gx, "grid_y": gy,
                    "x0": x0, "y0": y0, "x1": x1, "y1": y1,
                    "cx": (x0 + x1) / 2, "cy": (y0 + y1) / 2,
                    "status": "ok",
                }
                try:
                    dx, dy, score = estimate_tile_shift(mov, ref, x0, y0, x1, y1,
                                                        args.max_shift, args.inner_margin)
                    row.update(dx_px=dx, dy_px=dy, score=score,
                               magnitude_px=math.hypot(dx, dy))
                    if score < args.min_score:
                        row["status"] = "low_score"
                except Exception as exc:
                    row["status"] = "error"
                    row["error"] = str(exc)
                rows.append(row)
                all_rows.append(row)

        ok = [r for r in rows if r["status"] == "ok"]
        if ok:
            dxs = np.array([r["dx_px"] for r in ok], dtype=float)
            dys = np.array([r["dy_px"] for r in ok], dtype=float)
            mags = np.hypot(dxs, dys)
            s = {
                "file": path.name,
                "tiles_ok": len(ok),
                "tiles_total": len(rows),
                "median_dx_px": float(np.median(dxs)),
                "median_dy_px": float(np.median(dys)),
                "std_dx_px": float(np.std(dxs)),
                "std_dy_px": float(np.std(dys)),
                "p95_magnitude_px": float(np.percentile(mags, 95)),
                "spatial_variation_px": float(np.hypot(np.std(dxs), np.std(dys))),
            }
        else:
            s = {"file": path.name, "tiles_ok": 0, "tiles_total": len(rows)}
        summary.append(s)

        qa = draw_vectors(ref_color, rows)
        cv2.imwrite(str(args.output_dir / f"local-vectors-{path.stem}.jpg"), qa,
                    [cv2.IMWRITE_JPEG_QUALITY, 92])
        print(json.dumps(s, ensure_ascii=False))

    keys = ["file", "grid_x", "grid_y", "x0", "y0", "x1", "y1", "cx", "cy",
            "status", "dx_px", "dy_px", "magnitude_px", "score", "error"]
    with (args.output_dir / "local-registration-grid.csv").open("w", newline="", encoding="utf-8") as fh:
        wr = csv.DictWriter(fh, fieldnames=keys, extrasaction="ignore")
        wr.writeheader(); wr.writerows(all_rows)

    (args.output_dir / "local-registration-grid.json").write_text(
        json.dumps(all_rows, indent=2, ensure_ascii=False), encoding="utf-8")
    (args.output_dir / "local-registration-summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\nSalida: {args.output_dir}")
    print("Interpretación: spatial_variation_px alto => una transformación global no alcanza.")


if __name__ == "__main__":
    main()
