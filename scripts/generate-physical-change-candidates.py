#!/usr/bin/env python3
"""Genera candidatos de cambio físico temporal dentro de Productivo.

Este script NO clasifica automáticamente loteo, calles ni movimiento de suelo.
Produce una capa raster de *cambio físico aparente* entre pares de fechas ya
co-registradas, restringida al scope Productivo, para priorizar QA humano y el
entrenamiento posterior de señales no edilicias.

Entradas esperadas:
- mosaicos históricos ya registrados contra 2023;
- georreferencia versionada del Cluster 2;
- máscara Productivo reconstruida del Anexo I.

Salida por par temporal:
- heatmap PNG del score continuo;
- máscara PNG de candidatos fuertes;
- overlay JPG sobre la imagen más reciente;
- JSON con métricas reproducibles.

El score combina cambio cromático perceptual, cambio de textura/bordes y cambio
de verdor relativo. Está pensado como *candidate generator*, no como evidencia
jurídica ni como detector semántico final.
"""
from __future__ import annotations

import argparse
import gzip
import json
import math
from pathlib import Path

import cv2
import numpy as np
from shapely.geometry import shape

DEFAULT_META = Path("config/territorial/cluster-02-georef.json")
DEFAULT_PRODUCTIVA = Path("public/data/auditoria/zonificacion-11819-productiva.geojson.gz")
DEFAULT_REGISTERED = Path("tmp/territorial-analysis/cluster-02-history/registered-local")
DEFAULT_OUTPUT = Path("tmp/territorial-analysis/cluster-02-history/physical-change-candidates")
DEFAULT_DATES = ["2016-11-30", "2020-03-03", "2022-03-01", "2023-04-19", "2026-01-11"]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--registered-dir", type=Path, default=DEFAULT_REGISTERED)
    p.add_argument("--metadata", type=Path, default=DEFAULT_META)
    p.add_argument("--productiva-mask", type=Path, default=DEFAULT_PRODUCTIVA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--dates", nargs="+", default=DEFAULT_DATES)
    p.add_argument("--percentile", type=float, default=93.0,
                   help="Percentil del score Productivo usado como candidato fuerte")
    p.add_argument("--min-component-px", type=int, default=18)
    return p.parse_args()


def load_json(path: Path):
    if path.suffix.lower() == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            return json.load(fh)
    return json.loads(path.read_text(encoding="utf-8"))


def lonlat_to_world_px(lon: float, lat: float, z: int) -> tuple[float, float]:
    n = 256.0 * (2 ** z)
    x = (lon + 180.0) / 360.0 * n
    lat = max(min(lat, 85.05112878), -85.05112878)
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
    return x, y


def polygon_to_pixels(coords, origin_x: float, origin_y: float, z: int) -> np.ndarray:
    pts = []
    for lon, lat, *_ in coords:
        wx, wy = lonlat_to_world_px(float(lon), float(lat), z)
        pts.append([round(wx - origin_x), round(wy - origin_y)])
    return np.asarray(pts, dtype=np.int32)


def rasterize_productivo(meta: dict, geojson: dict, shape_hw: tuple[int, int]) -> np.ndarray:
    h, w = shape_hw
    bbox = meta["bbox_wgs84"]
    z = int(meta["zoom"])
    origin_x, origin_y = lonlat_to_world_px(float(bbox[0]), float(bbox[3]), z)
    mask = np.zeros((h, w), dtype=np.uint8)

    for feature in geojson.get("features", []):
        geom = shape(feature["geometry"])
        geoms = [geom] if geom.geom_type == "Polygon" else list(getattr(geom, "geoms", []))
        for poly in geoms:
            if poly.geom_type != "Polygon":
                continue
            exterior = polygon_to_pixels(poly.exterior.coords, origin_x, origin_y, z)
            if len(exterior) >= 3:
                cv2.fillPoly(mask, [exterior], 255)
            for ring in poly.interiors:
                hole = polygon_to_pixels(ring.coords, origin_x, origin_y, z)
                if len(hole) >= 3:
                    cv2.fillPoly(mask, [hole], 0)
    return mask


def read_image(path: Path) -> np.ndarray:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"No se pudo leer {path}")
    return img


def robust_scale(arr: np.ndarray, valid: np.ndarray) -> np.ndarray:
    values = arr[valid]
    if values.size == 0:
        return np.zeros_like(arr, dtype=np.float32)
    p50, p95 = np.percentile(values, [50, 95])
    scale = max(float(p95 - p50), 1e-6)
    return np.clip((arr.astype(np.float32) - p50) / scale, 0.0, 1.0)


def exg(img_bgr: np.ndarray) -> np.ndarray:
    b, g, r = cv2.split(img_bgr.astype(np.float32) / 255.0)
    return 2.0 * g - r - b


def gradient_mag(gray: np.ndarray) -> np.ndarray:
    g = gray.astype(np.float32) / 255.0
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    return cv2.magnitude(gx, gy)


def connected_filter(mask: np.ndarray, min_px: int) -> tuple[np.ndarray, int]:
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    out = np.zeros_like(mask)
    kept = 0
    for idx in range(1, n):
        area = int(stats[idx, cv2.CC_STAT_AREA])
        if area >= min_px:
            out[labels == idx] = 255
            kept += 1
    return out, kept


def overlay(image: np.ndarray, strong: np.ndarray) -> np.ndarray:
    out = image.copy()
    tint = np.zeros_like(out)
    tint[:, :, 2] = 255
    alpha = (strong.astype(np.float32) / 255.0 * 0.45)[:, :, None]
    return np.clip(out * (1.0 - alpha) + tint * alpha, 0, 255).astype(np.uint8)


def process_pair(old: np.ndarray, new: np.ndarray, productivo: np.ndarray,
                 percentile: float, min_component_px: int):
    valid = productivo > 0

    old_lab = cv2.cvtColor(old, cv2.COLOR_BGR2LAB).astype(np.float32)
    new_lab = cv2.cvtColor(new, cv2.COLOR_BGR2LAB).astype(np.float32)
    color_delta = np.linalg.norm(new_lab - old_lab, axis=2)

    old_gray = cv2.cvtColor(old, cv2.COLOR_BGR2GRAY)
    new_gray = cv2.cvtColor(new, cv2.COLOR_BGR2GRAY)
    texture_delta = np.abs(gradient_mag(new_gray) - gradient_mag(old_gray))

    green_delta = np.abs(exg(new) - exg(old))

    color_s = robust_scale(color_delta, valid)
    texture_s = robust_scale(texture_delta, valid)
    green_s = robust_scale(green_delta, valid)

    score = 0.55 * color_s + 0.25 * texture_s + 0.20 * green_s
    score[~valid] = 0.0

    threshold = float(np.percentile(score[valid], percentile))
    strong = ((score >= threshold) & valid).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    strong = cv2.morphologyEx(strong, cv2.MORPH_OPEN, kernel)
    strong = cv2.morphologyEx(strong, cv2.MORPH_CLOSE, kernel)
    strong, components = connected_filter(strong, min_component_px)

    metrics = {
        "score_mean_productivo": float(score[valid].mean()),
        "score_p95_productivo": float(np.percentile(score[valid], 95)),
        "strong_threshold": threshold,
        "strong_candidate_fraction_productivo": float((strong[valid] > 0).mean()),
        "strong_components": int(components),
    }
    return score, strong, metrics


def main() -> None:
    args = parse_args()
    if not 50.0 < args.percentile < 100.0:
        raise SystemExit("--percentile debe estar entre 50 y 100")
    args.output_dir.mkdir(parents=True, exist_ok=True)

    meta = load_json(args.metadata)
    productiva_geojson = load_json(args.productiva_mask)
    images = {}
    for date in args.dates:
        path = args.registered_dir / f"{date}.jpg"
        if not path.exists():
            raise SystemExit(f"Falta mosaico registrado: {path}")
        images[date] = read_image(path)

    ref_shape = next(iter(images.values())).shape[:2]
    for date, img in images.items():
        if img.shape[:2] != ref_shape:
            raise SystemExit(f"Dimensiones incompatibles en {date}: {img.shape[:2]} vs {ref_shape}")

    productivo = rasterize_productivo(meta, productiva_geojson, ref_shape)
    if not np.any(productivo):
        raise SystemExit("La máscara Productivo rasterizada quedó vacía")
    cv2.imwrite(str(args.output_dir / "productivo-scope.png"), productivo)

    report = {
        "scope": "Productivo only",
        "method": "candidate generator: LAB color change + edge/texture change + ExG change",
        "warning": "No clasifica automáticamente loteo ni legalidad; prioriza cambio físico aparente para QA.",
        "percentile": args.percentile,
        "min_component_px": args.min_component_px,
        "pairs": [],
    }

    for old_date, new_date in zip(args.dates[:-1], args.dates[1:]):
        score, strong, metrics = process_pair(
            images[old_date], images[new_date], productivo,
            args.percentile, args.min_component_px,
        )
        stem = f"{old_date}_to_{new_date}"
        heat = np.clip(score * 255.0, 0, 255).astype(np.uint8)
        heat_color = cv2.applyColorMap(heat, cv2.COLORMAP_TURBO)
        heat_color[productivo == 0] = 0
        cv2.imwrite(str(args.output_dir / f"{stem}-score.png"), heat_color)
        cv2.imwrite(str(args.output_dir / f"{stem}-strong.png"), strong)
        cv2.imwrite(
            str(args.output_dir / f"{stem}-overlay.jpg"),
            overlay(images[new_date], strong),
            [cv2.IMWRITE_JPEG_QUALITY, 92],
        )
        row = {"from": old_date, "to": new_date, **metrics}
        report["pairs"].append(row)
        print(
            f"{stem}: strong_fraction={metrics['strong_candidate_fraction_productivo']:.4f} "
            f"components={metrics['strong_components']} threshold={metrics['strong_threshold']:.4f}"
        )

    report_path = args.output_dir / "physical-change-candidates-qa.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nQA: {report_path}")
    print(f"OUTPUT: {args.output_dir}")


if __name__ == "__main__":
    main()
