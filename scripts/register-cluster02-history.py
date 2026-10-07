#!/usr/bin/env python3
"""Co-registra los mosaicos históricos del Cluster 2 contra una referencia maestra.

Diseñado para el piloto territorial de BioCorredor MR. Usa puntos ORB robustos +
RANSAC para estimar una transformación afín (traslación/rotación/escala) por fecha,
y produce imágenes registradas y métricas QA. No usa footprints Overture como puntos
de control: el registro depende solo de textura/estructuras persistentes de las imágenes.

Solo procesa mosaicos fuente con nombre YYYY-MM-DD.jpg, evitando previews, láminas
de validación y otros JPG auxiliares presentes en el mismo directorio.

Ejemplo:
  python scripts/register-cluster02-history.py \
    --input-dir tmp/territorial-analysis/cluster-02-history \
    --reference 2023-04-19.jpg \
    --output-dir tmp/territorial-analysis/cluster-02-history/registered-v2
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


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--input-dir", type=Path, required=True)
    p.add_argument("--reference", default="2023-04-19.jpg")
    p.add_argument("--output-dir", type=Path, required=True)
    p.add_argument("--max-match-dim", type=int, default=1800)
    p.add_argument("--features", type=int, default=12000)
    p.add_argument("--ratio", type=float, default=0.75)
    p.add_argument("--ransac-threshold", type=float, default=2.5)
    p.add_argument("--min-inliers", type=int, default=40)
    return p.parse_args()


def read_rgb(path: Path) -> np.ndarray:
    im = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if im is None:
        raise RuntimeError(f"No se pudo leer {path}")
    return im


def match_scale(image: np.ndarray, max_dim: int) -> tuple[np.ndarray, float]:
    h, w = image.shape[:2]
    s = min(1.0, max_dim / max(h, w))
    if s == 1.0:
        return image, 1.0
    return cv2.resize(image, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA), s


def prep_gray(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(gray)


def estimate_affine(moving: np.ndarray, reference: np.ndarray, args: argparse.Namespace):
    if moving.shape[:2] != reference.shape[:2]:
        raise RuntimeError(f"Dimensiones distintas: moving={moving.shape[:2]}, ref={reference.shape[:2]}")

    mov_small, scale = match_scale(moving, args.max_match_dim)
    ref_small, scale_ref = match_scale(reference, args.max_match_dim)
    if abs(scale - scale_ref) > 1e-9:
        raise RuntimeError("Las escalas de matching no coinciden")

    g_mov = prep_gray(mov_small)
    g_ref = prep_gray(ref_small)
    orb = cv2.ORB_create(nfeatures=args.features, fastThreshold=7)
    kp_mov, des_mov = orb.detectAndCompute(g_mov, None)
    kp_ref, des_ref = orb.detectAndCompute(g_ref, None)
    if des_mov is None or des_ref is None:
        raise RuntimeError("ORB no encontró descriptores suficientes")

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    pairs = matcher.knnMatch(des_mov, des_ref, k=2)
    good = [m for m, n in pairs if m.distance < args.ratio * n.distance]
    if len(good) < args.min_inliers:
        raise RuntimeError(f"Solo {len(good)} matches robustos")

    src = np.float32([kp_mov[m.queryIdx].pt for m in good])
    dst = np.float32([kp_ref[m.trainIdx].pt for m in good])
    matrix_small, inlier_mask = cv2.estimateAffinePartial2D(
        src,
        dst,
        method=cv2.RANSAC,
        ransacReprojThreshold=args.ransac_threshold,
        maxIters=10000,
        confidence=0.999,
        refineIters=50,
    )
    if matrix_small is None or inlier_mask is None:
        raise RuntimeError("No se pudo estimar transformación afín")

    inliers = inlier_mask.ravel().astype(bool)
    n_inliers = int(inliers.sum())
    if n_inliers < args.min_inliers:
        raise RuntimeError(f"Solo {n_inliers} inliers después de RANSAC")

    pred = cv2.transform(src[inliers].reshape(-1, 1, 2), matrix_small).reshape(-1, 2)
    residuals_small = np.linalg.norm(pred - dst[inliers], axis=1)

    matrix = matrix_small.copy()
    matrix[:, 2] /= scale
    residuals = residuals_small / scale

    a, b = float(matrix[0, 0]), float(matrix[0, 1])
    rotation_deg = math.degrees(math.atan2(b, a))
    scale_est = math.sqrt(a * a + b * b)
    qa = {
        "matches": len(good),
        "inliers": n_inliers,
        "inlier_ratio": n_inliers / len(good),
        "rmse_px": float(np.sqrt(np.mean(residuals ** 2))),
        "median_residual_px": float(np.median(residuals)),
        "p95_residual_px": float(np.percentile(residuals, 95)),
        "dx_px": float(matrix[0, 2]),
        "dy_px": float(matrix[1, 2]),
        "rotation_deg": rotation_deg,
        "scale": scale_est,
    }
    return matrix, qa


def overlay(reference: np.ndarray, registered: np.ndarray) -> np.ndarray:
    ref = cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)
    reg = cv2.cvtColor(registered, cv2.COLOR_BGR2GRAY)
    return cv2.merge([reg, ref, ref])


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    ref_path = args.input_dir / args.reference
    reference = read_rgb(ref_path)
    files = sorted(p for p in args.input_dir.iterdir() if p.is_file() and DATE_JPG.match(p.name))
    if ref_path not in files:
        raise SystemExit(f"No encontré referencia: {ref_path}")

    report = []
    for path in files:
        row = {"file": path.name, "reference": args.reference, "status": "ok"}
        try:
            moving = read_rgb(path)
            if path == ref_path:
                matrix = np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]], dtype=np.float64)
                qa = {"matches": None, "inliers": None, "inlier_ratio": 1.0, "rmse_px": 0.0,
                      "median_residual_px": 0.0, "p95_residual_px": 0.0, "dx_px": 0.0,
                      "dy_px": 0.0, "rotation_deg": 0.0, "scale": 1.0}
                registered = moving.copy()
            else:
                matrix, qa = estimate_affine(moving, reference, args)
                h, w = reference.shape[:2]
                registered = cv2.warpAffine(
                    moving, matrix, (w, h), flags=cv2.INTER_CUBIC,
                    borderMode=cv2.BORDER_REFLECT101,
                )
            out = args.output_dir / path.name
            cv2.imwrite(str(out), registered, [cv2.IMWRITE_JPEG_QUALITY, 95])
            cv2.imwrite(str(args.output_dir / f"qa-overlay-{path.stem}.jpg"), overlay(reference, registered),
                        [cv2.IMWRITE_JPEG_QUALITY, 90])
            row.update(qa)
            row["matrix"] = matrix.tolist()
            print(f"{path.name}: dx={qa['dx_px']:.2f}px dy={qa['dy_px']:.2f}px "
                  f"rot={qa['rotation_deg']:.4f}° scale={qa['scale']:.6f} "
                  f"RMSE={qa['rmse_px']:.2f}px inliers={qa['inliers']}")
        except Exception as exc:
            row["status"] = "error"
            row["error"] = str(exc)
            print(f"ERROR {path.name}: {exc}")
        report.append(row)

    json_path = args.output_dir / "registration-qa.json"
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    keys = ["file", "reference", "status", "matches", "inliers", "inlier_ratio", "rmse_px",
            "median_residual_px", "p95_residual_px", "dx_px", "dy_px", "rotation_deg", "scale", "error"]
    with (args.output_dir / "registration-qa.csv").open("w", newline="", encoding="utf-8") as fh:
        wr = csv.DictWriter(fh, fieldnames=keys, extrasaction="ignore")
        wr.writeheader(); wr.writerows(report)

    failures = [r for r in report if r["status"] != "ok"]
    print(f"\nQA: {json_path}")
    print(f"OK={len(report)-len(failures)} ERROR={len(failures)}")
    if failures:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
