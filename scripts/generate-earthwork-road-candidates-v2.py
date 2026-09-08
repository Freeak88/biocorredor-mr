#!/usr/bin/env python3
"""Genera candidatos dirigidos de movimiento de suelo y apertura de calles dentro de Productivo.

V2 del bloque Fase D. Parte de mosaicos históricos ya co-registrados y evita usar
el cambio absoluto como señal final porque ese enfoque responde demasiado a
estacionalidad, cultivos, árboles y diferencias radiométricas.

Produce dos señales auxiliares por intervalo:
- earthwork: pérdida de verdor + suelo expuesto + cambio estructural local;
- road: earthwork reforzado por geometría lineal persistente en la imagen nueva.

No clasifica loteo ni legalidad. Es un generador de candidatos para QA humano.
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
HISTORY_ROOT = Path("tmp/territorial-analysis/cluster-02-history")
DEFAULT_REGISTERED = HISTORY_ROOT / "registered-v2"
DEFAULT_OUTPUT = HISTORY_ROOT / "earthwork-road-candidates-v2"
DEFAULT_DATES = ["2016-11-30", "2020-03-03", "2022-03-01", "2023-04-19", "2026-01-11"]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--registered-dir", type=Path, default=DEFAULT_REGISTERED)
    p.add_argument("--metadata", type=Path, default=DEFAULT_META)
    p.add_argument("--productiva-mask", type=Path, default=DEFAULT_PRODUCTIVA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--dates", nargs="+", default=DEFAULT_DATES)
    p.add_argument("--earthwork-percentile", type=float, default=97.0)
    p.add_argument("--road-percentile", type=float, default=96.0)
    p.add_argument("--min-component-px", type=int, default=24)
    return p.parse_args()


def load_json(path: Path):
    if path.suffix.lower() == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            return json.load(fh)
    return json.loads(path.read_text(encoding="utf-8"))


def has_all_dates(path: Path, dates: list[str]) -> bool:
    return path.is_dir() and all((path / f"{d}.jpg").is_file() for d in dates)


def resolve_registered_dir(requested: Path, dates: list[str]) -> Path:
    """Resuelve un directorio de mosaicos ya registrados sin caer a imágenes crudas.

    Prioridad:
    1) --registered-dir explícito/default si contiene todas las fechas;
    2) nombres históricos conocidos del proyecto;
    3) cualquier subdirectorio inmediato de cluster-02-history cuyo nombre contenga
       'register' y tenga las cinco capturas.

    Nunca usa silenciosamente JPG del directorio raíz porque pueden ser mosaicos sin
    co-registro y eso invalidaría la comparación temporal.
    """
    candidates: list[Path] = []

    def add(p: Path) -> None:
        if p not in candidates:
            candidates.append(p)

    add(requested)
    add(HISTORY_ROOT / "registered-local")
    add(HISTORY_ROOT / "registered")
    add(HISTORY_ROOT / "registered-v2")

    if HISTORY_ROOT.is_dir():
        for p in sorted(HISTORY_ROOT.iterdir()):
            if p.is_dir() and "register" in p.name.lower():
                add(p)

    valid = [p for p in candidates if has_all_dates(p, dates)]
    if valid:
        chosen = valid[0]
        if chosen != requested:
            print(f"registered_dir auto-resuelto: {chosen}")
        return chosen

    checked = "\n  - ".join(str(p) for p in candidates)
    raise SystemExit(
        "No encontré un directorio de mosaicos co-registrados con todas las fechas. "
        "Directorios revisados:\n  - " + checked +
        "\nNo se usarán mosaicos crudos como fallback."
    )


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
            ext = polygon_to_pixels(poly.exterior.coords, origin_x, origin_y, z)
            if len(ext) >= 3:
                cv2.fillPoly(mask, [ext], 255)
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


def robust01(arr: np.ndarray, valid: np.ndarray, lo=50, hi=95) -> np.ndarray:
    vals = arr[valid]
    if vals.size == 0:
        return np.zeros_like(arr, dtype=np.float32)
    a, b = np.percentile(vals, [lo, hi])
    den = max(float(b - a), 1e-6)
    return np.clip((arr.astype(np.float32) - a) / den, 0.0, 1.0)


def exg(img: np.ndarray) -> np.ndarray:
    b, g, r = cv2.split(img.astype(np.float32) / 255.0)
    return 2.0 * g - r - b


def redness(img: np.ndarray) -> np.ndarray:
    b, g, r = cv2.split(img.astype(np.float32) / 255.0)
    return r - 0.5 * (g + b)


def gradient_mag(gray: np.ndarray) -> np.ndarray:
    f = gray.astype(np.float32) / 255.0
    gx = cv2.Sobel(f, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(f, cv2.CV_32F, 0, 1, ksize=3)
    return cv2.magnitude(gx, gy)


def hough_line_support(gray: np.ndarray, valid: np.ndarray) -> np.ndarray:
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 55, 140)
    edges[~valid] = 0
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=32, minLineLength=22, maxLineGap=7)
    support = np.zeros_like(gray, dtype=np.uint8)
    if lines is not None:
        for line in lines[:, 0]:
            x1, y1, x2, y2 = map(int, line)
            cv2.line(support, (x1, y1), (x2, y2), 255, 5)
    support = cv2.GaussianBlur(support, (9, 9), 0).astype(np.float32) / 255.0
    support[~valid] = 0.0
    return support


def filter_components(mask: np.ndarray, min_px: int) -> tuple[np.ndarray, int]:
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    out = np.zeros_like(mask)
    kept = 0
    for i in range(1, n):
        if int(stats[i, cv2.CC_STAT_AREA]) >= min_px:
            out[labels == i] = 255
            kept += 1
    return out, kept


def colorize(score: np.ndarray, valid: np.ndarray) -> np.ndarray:
    heat = cv2.applyColorMap(np.clip(score * 255, 0, 255).astype(np.uint8), cv2.COLORMAP_TURBO)
    heat[~valid] = 0
    return heat


def overlay(img: np.ndarray, earth: np.ndarray, road: np.ndarray) -> np.ndarray:
    out = img.copy().astype(np.float32)
    red = earth > 0
    cyan = road > 0
    out[red] = 0.55 * out[red] + 0.45 * np.array([20, 20, 255], np.float32)
    out[cyan] = 0.45 * out[cyan] + 0.55 * np.array([255, 255, 0], np.float32)
    return np.clip(out, 0, 255).astype(np.uint8)


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    meta = load_json(args.metadata)
    prod = load_json(args.productiva_mask)
    registered_dir = resolve_registered_dir(args.registered_dir, args.dates)

    images = {}
    for d in args.dates:
        p = registered_dir / f"{d}.jpg"
        images[d] = read_image(p)

    shape_hw = next(iter(images.values())).shape[:2]
    if any(img.shape[:2] != shape_hw for img in images.values()):
        raise SystemExit("Los mosaicos registrados no tienen dimensiones consistentes")

    productivo = rasterize_productivo(meta, prod, shape_hw)
    valid = productivo > 0
    if not np.any(valid):
        raise SystemExit("Scope Productivo vacío")

    report = {
        "scope": "Productivo only",
        "registered_dir": str(registered_dir),
        "method": "directional V2: vegetation loss + exposed-soil tendency + structural change + linear support",
        "warning": "Candidate generator only; no automatic loteo/legal classification.",
        "pairs": [],
    }

    for old_d, new_d in zip(args.dates[:-1], args.dates[1:]):
        old = images[old_d]
        new = images[new_d]

        old_exg = exg(old)
        new_exg = exg(new)
        veg_loss = np.maximum(old_exg - new_exg, 0.0)
        veg_loss_s = robust01(veg_loss, valid, 55, 97)

        low_veg = np.clip(1.0 - robust01(new_exg, valid, 30, 80), 0.0, 1.0)
        soil_s = robust01(redness(new), valid, 55, 95)

        old_g = gradient_mag(cv2.cvtColor(old, cv2.COLOR_BGR2GRAY))
        new_gray = cv2.cvtColor(new, cv2.COLOR_BGR2GRAY)
        new_g = gradient_mag(new_gray)
        structure_gain = np.maximum(new_g - old_g, 0.0)
        structure_s = robust01(structure_gain, valid, 55, 97)

        earth_score = (
            0.46 * veg_loss_s +
            0.24 * low_veg +
            0.18 * soil_s +
            0.12 * structure_s
        )
        earth_score[~valid] = 0.0

        line_support = hough_line_support(new_gray, valid)
        road_score = earth_score * (0.35 + 0.65 * line_support)
        road_score[~valid] = 0.0

        e_thr = float(np.percentile(earth_score[valid], args.earthwork_percentile))
        r_thr = float(np.percentile(road_score[valid], args.road_percentile))
        earth = ((earth_score >= e_thr) & valid).astype(np.uint8) * 255
        road = ((road_score >= r_thr) & valid).astype(np.uint8) * 255

        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        earth = cv2.morphologyEx(earth, cv2.MORPH_OPEN, k)
        earth = cv2.morphologyEx(earth, cv2.MORPH_CLOSE, k)
        road = cv2.morphologyEx(road, cv2.MORPH_CLOSE, k)
        earth, e_components = filter_components(earth, args.min_component_px)
        road, r_components = filter_components(road, args.min_component_px)

        stem = f"{old_d}_to_{new_d}"
        cv2.imwrite(str(args.output_dir / f"{stem}-earthwork-score.png"), colorize(earth_score, valid))
        cv2.imwrite(str(args.output_dir / f"{stem}-earthwork-strong.png"), earth)
        cv2.imwrite(str(args.output_dir / f"{stem}-road-score.png"), colorize(road_score, valid))
        cv2.imwrite(str(args.output_dir / f"{stem}-road-strong.png"), road)
        cv2.imwrite(str(args.output_dir / f"{stem}-overlay.jpg"), overlay(new, earth, road), [cv2.IMWRITE_JPEG_QUALITY, 92])

        row = {
            "from": old_d,
            "to": new_d,
            "earthwork_threshold": e_thr,
            "earthwork_fraction_productivo": float((earth[valid] > 0).mean()),
            "earthwork_components": int(e_components),
            "road_threshold": r_thr,
            "road_fraction_productivo": float((road[valid] > 0).mean()),
            "road_components": int(r_components),
        }
        report["pairs"].append(row)
        print(
            f"{stem}: earth={row['earthwork_fraction_productivo']:.4f} ({e_components} comp) "
            f"road={row['road_fraction_productivo']:.4f} ({r_components} comp)"
        )

    out = args.output_dir / "earthwork-road-candidates-v2-qa.json"
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nQA: {out}")
    print(f"OUTPUT: {args.output_dir}")


if __name__ == "__main__":
    main()
