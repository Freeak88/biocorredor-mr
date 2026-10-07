#!/usr/bin/env python3
"""Contrasta internal_road_score V5 con estructura parcelaria GeoARBA en Cluster 2.

IMPORTANTE
----------
GeoARBA disponible en el repo contiene polígonos parcelarios, no una capa oficial
independiente de ejes/calles aprobadas. Por eso este script NO clasifica
"calle declarada/no declarada". Clasifica soporte de *estructura catastral*:

- cadastral_aligned: señal vial HIGH/MEDIUM cercana a límites parcelarios actuales;
- inside_parcel_without_boundary_match: señal vial que atraviesa interior parcelario
  sin correspondencia cercana con límites actuales; candidato prioritario a revisión;
- outside_parcel_without_boundary_match: señal vial fuera de polígonos y lejos de límites;
- uncertain: señal LOW o casos no concluyentes.

Una vía físicamente observable que atraviesa el interior de una parcela vigente es
interesante para auditoría, pero no prueba por sí sola falta de aprobación, venta,
irregularidad ni ilegalidad.
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import math
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
DEFAULT_V5_ROOT = HISTORY_ROOT / "internal-road-score-v5"
DEFAULT_OUTPUT = HISTORY_ROOT / "road-geoarba-match"
DEFAULT_GEOARBA = [
    Path("public/data/geoarba/ministro-rivadavia-parcels-noroeste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-noreste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-suroeste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-sureste.geojson"),
]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--date", default="2026-01-11")
    p.add_argument("--v5-root", type=Path, default=DEFAULT_V5_ROOT)
    p.add_argument("--registered-dir", type=Path, default=v2.DEFAULT_REGISTERED)
    p.add_argument("--metadata", type=Path, default=v2.DEFAULT_META)
    p.add_argument("--productiva-mask", type=Path, default=v2.DEFAULT_PRODUCTIVA)
    p.add_argument("--geoarba", type=Path, nargs="+", default=DEFAULT_GEOARBA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument(
        "--boundary-match-radius-px",
        type=int,
        default=12,
        help="Distancia máxima desde señal vial al límite parcelario para considerarla alineada",
    )
    p.add_argument("--min-component-px", type=int, default=20)
    return p.parse_args()


def read_gray(path: Path) -> np.ndarray:
    arr = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if arr is None:
        raise FileNotFoundError(path)
    return arr


def feature_bbox(geom: dict) -> tuple[float, float, float, float] | None:
    coords = geom.get("coordinates") if isinstance(geom, dict) else None
    if coords is None:
        return None
    xs: list[float] = []
    ys: list[float] = []

    def walk(x) -> None:
        if isinstance(x, (list, tuple)):
            if len(x) >= 2 and isinstance(x[0], (int, float)) and isinstance(x[1], (int, float)):
                xs.append(float(x[0])); ys.append(float(x[1]))
            else:
                for y in x:
                    walk(y)
    walk(coords)
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def intersects_bbox(a, b) -> bool:
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])


def ring_to_pixels(ring, origin_x: float, origin_y: float, z: int) -> np.ndarray:
    pts = []
    for coord in ring:
        if len(coord) < 2:
            continue
        wx, wy = v2.lonlat_to_world_px(float(coord[0]), float(coord[1]), z)
        pts.append([round(wx - origin_x), round(wy - origin_y)])
    return np.asarray(pts, dtype=np.int32)


def rasterize_geoarba(
    paths: list[Path], meta: dict, shape_hw: tuple[int, int]
) -> tuple[np.ndarray, np.ndarray, dict]:
    h, w = shape_hw
    bbox = tuple(map(float, meta["bbox_wgs84"]))
    z = int(meta["zoom"])
    origin_x, origin_y = v2.lonlat_to_world_px(bbox[0], bbox[3], z)
    fill = np.zeros((h, w), dtype=np.uint8)
    boundaries = np.zeros((h, w), dtype=np.uint8)
    seen: set[str] = set()
    features_total = 0
    features_bbox = 0

    def draw_polygon(poly_coords) -> None:
        if not poly_coords:
            return
        ext = ring_to_pixels(poly_coords[0], origin_x, origin_y, z)
        if len(ext) >= 3:
            cv2.fillPoly(fill, [ext], 255)
            cv2.polylines(boundaries, [ext], True, 255, 1, cv2.LINE_8)
        for hole_ring in poly_coords[1:]:
            hole = ring_to_pixels(hole_ring, origin_x, origin_y, z)
            if len(hole) >= 3:
                cv2.fillPoly(fill, [hole], 0)
                cv2.polylines(boundaries, [hole], True, 255, 1, cv2.LINE_8)

    for path in paths:
        if not path.exists():
            raise SystemExit(f"No existe GeoARBA: {path}")
        data = json.loads(path.read_text(encoding="utf-8"))
        for feature in data.get("features", []):
            features_total += 1
            geom = feature.get("geometry") or {}
            fb = feature_bbox(geom)
            if fb is None or not intersects_bbox(fb, bbox):
                continue
            props = feature.get("properties") or {}
            fid = str(props.get("nomenclatura") or "") + "|" + str(props.get("partida") or "")
            # Los cuatro archivos por cuadrante pueden solaparse. Evita dibujar duplicados exactos.
            if fid != "|" and fid in seen:
                continue
            if fid != "|":
                seen.add(fid)
            features_bbox += 1
            typ = geom.get("type")
            coords = geom.get("coordinates") or []
            if typ == "Polygon":
                draw_polygon(coords)
            elif typ == "MultiPolygon":
                for poly in coords:
                    draw_polygon(poly)

    qa = {
        "geoarba_features_total_read": features_total,
        "geoarba_features_intersecting_cluster_bbox": features_bbox,
        "geoarba_unique_ids_drawn": len(seen),
    }
    return fill, boundaries, qa


def component_rows(mask: np.ndarray, classes: np.ndarray, score: np.ndarray, min_px: int) -> list[dict]:
    n, labels, stats, centroids = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    rows = []
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < min_px:
            continue
        m = labels == i
        vals, counts = np.unique(classes[m], return_counts=True)
        dominant = int(vals[int(np.argmax(counts))]) if len(vals) else 0
        rows.append({
            "component_id": i,
            "pixel_area": area,
            "bbox_x": int(stats[i, cv2.CC_STAT_LEFT]),
            "bbox_y": int(stats[i, cv2.CC_STAT_TOP]),
            "bbox_w": int(stats[i, cv2.CC_STAT_WIDTH]),
            "bbox_h": int(stats[i, cv2.CC_STAT_HEIGHT]),
            "centroid_x": float(centroids[i][0]),
            "centroid_y": float(centroids[i][1]),
            "dominant_class_id": dominant,
            "score_mean": float(score[m].mean()) if np.any(m) else 0.0,
            "score_max": float(score[m].max()) if np.any(m) else 0.0,
        })
    return rows


def main() -> None:
    a = parse_args()
    a.output_dir.mkdir(parents=True, exist_ok=True)

    registered_dir = v2.resolve_registered_dir(a.registered_dir, [a.date])
    ref = v2.read_image(registered_dir / f"{a.date}.jpg")
    h, w = ref.shape[:2]
    meta = v2.load_json(a.metadata)
    productivo = v2.rasterize_productivo(meta, v2.load_json(a.productiva_mask), (h, w)) > 0
    if not np.any(productivo):
        raise SystemExit("Scope Productivo vacío")

    score = read_gray(a.v5_root / "internal-road-score.png").astype(np.float32) / 255.0
    high = read_gray(a.v5_root / "internal-road-high.png") > 0
    medium = read_gray(a.v5_root / "internal-road-medium.png") > 0
    low = read_gray(a.v5_root / "internal-road-low.png") > 0
    for name, arr in {"score": score, "high": high, "medium": medium, "low": low}.items():
        if arr.shape != (h, w):
            raise SystemExit(f"Shape inesperado {name}: {arr.shape} vs {(h, w)}")

    detected = (high | medium) & productivo
    low &= productivo

    parcel_fill, parcel_boundary, geoqa = rasterize_geoarba(list(a.geoarba), meta, (h, w))
    parcel_fill_b = parcel_fill > 0
    boundary_b = parcel_boundary > 0

    # Distancia al límite parcelario más cercano. distanceTransform calcula distancia
    # a ceros, por eso invertimos la máscara de límites.
    inv_boundary = np.where(boundary_b, 0, 255).astype(np.uint8)
    distance_to_boundary = cv2.distanceTransform(inv_boundary, cv2.DIST_L2, 5)
    aligned_support = distance_to_boundary <= float(a.boundary_match_radius_px)

    cadastral_aligned = detected & aligned_support
    inside_without_match = detected & parcel_fill_b & ~aligned_support
    outside_without_match = detected & ~parcel_fill_b & ~aligned_support
    uncertain = low.copy()

    # Clases raster: 1 alineada, 2 atraviesa interior parcelario, 3 fuera de parcelas,
    # 4 LOW/uncertain. Prioridad de escritura evita solapes.
    classes = np.zeros((h, w), dtype=np.uint8)
    classes[cadastral_aligned] = 1
    classes[inside_without_match] = 2
    classes[outside_without_match] = 3
    classes[uncertain] = 4
    classes[~productivo] = 0

    cv2.imwrite(str(a.output_dir / "geoarba-parcel-boundaries.png"), parcel_boundary)
    cv2.imwrite(str(a.output_dir / "road-cadastral-aligned.png"), cadastral_aligned.astype(np.uint8) * 255)
    cv2.imwrite(str(a.output_dir / "road-inside-parcel-without-boundary-match.png"), inside_without_match.astype(np.uint8) * 255)
    cv2.imwrite(str(a.output_dir / "road-outside-parcel-without-boundary-match.png"), outside_without_match.astype(np.uint8) * 255)

    color = np.zeros_like(ref)
    color[classes == 1] = (0, 255, 0)       # verde
    color[classes == 2] = (0, 0, 255)       # rojo
    color[classes == 3] = (0, 165, 255)     # naranja
    color[classes == 4] = (255, 0, 255)     # magenta
    overlay = ref.astype(np.float32).copy()
    active = classes > 0
    overlay[active] = 0.38 * overlay[active] + 0.62 * color[active].astype(np.float32)
    # Dibujar límites GeoARBA en cian fino sólo para contexto visual.
    b = boundary_b & productivo
    overlay[b] = 0.35 * overlay[b] + 0.65 * np.array([255, 255, 0], np.float32)
    cv2.imwrite(
        str(a.output_dir / f"road-geoarba-structure-overlay-{a.date}.jpg"),
        np.clip(overlay, 0, 255).astype(np.uint8),
        [cv2.IMWRITE_JPEG_QUALITY, 92],
    )

    detected_n = max(1, int(detected[productivo].sum()))
    px_m = 156543.03392804097 * math.cos(math.radians((meta["bbox_wgs84"][1] + meta["bbox_wgs84"][3]) / 2.0)) / (2 ** int(meta["zoom"]))
    report = {
        "scope": "Productivo only within Cluster 2 coverage",
        "reference_date": a.date,
        "method": "V5 HIGH+MEDIUM road signal vs proximity to current GeoARBA parcel boundaries",
        "interpretation": "cadastral structure match, not legal/declaration status",
        "boundary_match_radius_px": a.boundary_match_radius_px,
        "approx_meters_per_pixel": px_m,
        "approx_boundary_match_radius_m": px_m * a.boundary_match_radius_px,
        **geoqa,
        "detected_high_medium_fraction_productivo": float(detected[productivo].mean()),
        "cadastral_aligned_fraction_productivo": float(cadastral_aligned[productivo].mean()),
        "inside_parcel_without_boundary_match_fraction_productivo": float(inside_without_match[productivo].mean()),
        "outside_parcel_without_boundary_match_fraction_productivo": float(outside_without_match[productivo].mean()),
        "cadastral_aligned_fraction_of_detected": float(cadastral_aligned[productivo].sum() / detected_n),
        "inside_parcel_without_boundary_match_fraction_of_detected": float(inside_without_match[productivo].sum() / detected_n),
        "outside_parcel_without_boundary_match_fraction_of_detected": float(outside_without_match[productivo].sum() / detected_n),
        "status": "diagnostic cadastral-structure contrast; visual QA required",
        "warning": (
            "GeoARBA usado aquí aporta polígonos parcelarios actuales, no una capa autónoma de calles aprobadas. "
            "'without_boundary_match' significa falta de correspondencia con límites parcelarios actuales dentro de la tolerancia, "
            "no calle no declarada ni irregular."
        ),
    }
    qa_path = a.output_dir / "road-geoarba-structure-qa.json"
    qa_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    rows = component_rows(detected, classes, score, a.min_component_px)
    csv_path = a.output_dir / "road-geoarba-components.csv"
    if rows:
        with csv_path.open("w", newline="", encoding="utf-8") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            wr.writeheader(); wr.writerows(rows)

    print("=== ROAD GEOARBA STRUCTURE QA ===")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"overlay={a.output_dir / f'road-geoarba-structure-overlay-{a.date}.jpg'}")
    print(f"qa={qa_path}")
    if rows:
        print(f"components={csv_path}")


if __name__ == "__main__":
    main()
