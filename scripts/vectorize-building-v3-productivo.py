#!/usr/bin/env python3
"""Vectoriza la segmentación V3 oficial y la restringe al suelo Productivo.

Principios:
- usa la georreferenciación histórica real del mosaico (bbox_wgs84 + z18);
- separa instancias con watershed usando mask probability + signed distance;
- convierte píxeles a WGS84 mediante Web Mercator world pixels;
- recorta exclusivamente contra las parcelas Productivo ya reconstruidas;
- exporta objetos y resumen por parcela.

Esto NO determina legalidad, aprobación ni venta. Produce evidencia de superficie
construida como una subcapa de transformación física observable.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import cv2
import geopandas as gpd
import numpy as np
import pandas as pd
from scipy import ndimage
from shapely.geometry import Polygon
from shapely.ops import transform as shp_transform


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--seg-dir", type=Path, required=True)
    p.add_argument("--date", default="2023-04-19")
    p.add_argument("--metadata", type=Path, required=True)
    p.add_argument("--productiva-parcels", type=Path, required=True)
    p.add_argument("--output-dir", type=Path, required=True)
    p.add_argument("--threshold", type=float, default=0.4371)
    p.add_argument("--seed-distance-threshold", type=float, default=0.20)
    p.add_argument("--min-seed-px", type=int, default=6)
    p.add_argument("--min-area-m2", type=float, default=2.6465)
    p.add_argument("--simplify-m", type=float, default=0.9626)
    return p.parse_args()


def lonlat_to_world_px(lon: float, lat: float, z: int) -> tuple[float, float]:
    n = 256.0 * (2 ** z)
    x = (lon + 180.0) / 360.0 * n
    lat = max(min(lat, 85.05112878), -85.05112878)
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
    return x, y


def world_px_to_lonlat(x: float, y: float, z: int) -> tuple[float, float]:
    n = 256.0 * (2 ** z)
    lon = x / n * 360.0 - 180.0
    a = math.pi * (1.0 - 2.0 * y / n)
    lat = math.degrees(math.atan(math.sinh(a)))
    return lon, lat


def load_gray(path: Path) -> np.ndarray:
    arr = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if arr is None:
        raise SystemExit(f"No se pudo leer: {path}")
    return arr


def reconstruct_inputs(seg_dir: Path, date: str) -> tuple[np.ndarray, np.ndarray]:
    prob_u8 = load_gray(seg_dir / f"{date}-building-prob.png")
    dist_u8 = load_gray(seg_dir / f"{date}-building-distance.png")
    prob = prob_u8.astype(np.float32) / 255.0
    signed_distance = dist_u8.astype(np.float32) / 255.0 * 2.0 - 1.0
    return prob, signed_distance


def watershed_instances(prob: np.ndarray, signed_distance: np.ndarray, threshold: float,
                        seed_distance_threshold: float, min_seed_px: int) -> np.ndarray:
    foreground = prob >= threshold
    seeds = foreground & (signed_distance >= seed_distance_threshold)

    labels, n = ndimage.label(seeds)
    if n:
        counts = np.bincount(labels.ravel())
        remove = np.where(counts < min_seed_px)[0]
        if len(remove):
            labels[np.isin(labels, remove)] = 0
        labels, _ = ndimage.label(labels > 0)

    # Fallback para edificios sin núcleo positivo suficiente.
    unlabeled_fg = foreground & (labels == 0)
    if labels.max() == 0 or unlabeled_fg.mean() > 0.01:
        fallback, _ = ndimage.label(foreground)
        if labels.max() == 0:
            labels = fallback
        else:
            next_id = int(labels.max()) + 1
            for lab in range(1, int(fallback.max()) + 1):
                comp = fallback == lab
                if np.any(labels[comp] > 0):
                    continue
                if int(comp.sum()) >= min_seed_px:
                    labels[comp] = next_id
                    next_id += 1

    # OpenCV watershed necesita una imagen de 3 canales. El gradiente combina
    # probabilidad de máscara y distancia para empujar fronteras a zonas menos probables.
    energy = np.clip((1.0 - prob) * 180.0 + (1.0 - (signed_distance + 1.0) / 2.0) * 75.0, 0, 255)
    img = cv2.cvtColor(energy.astype(np.uint8), cv2.COLOR_GRAY2BGR)
    markers = labels.astype(np.int32) + 1
    markers[~foreground] = 1
    unknown = foreground & (labels == 0)
    markers[unknown] = 0
    cv2.watershed(img, markers)
    out = markers - 1
    out[out < 0] = 0
    out[~foreground] = 0
    return out.astype(np.int32)


def contour_to_wgs84(contour: np.ndarray, left_px: float, top_px: float, z: int):
    pts = contour[:, 0, :]
    if len(pts) < 3:
        return None
    coords = [world_px_to_lonlat(left_px + float(x), top_px + float(y), z) for x, y in pts]
    poly = Polygon(coords)
    if not poly.is_valid:
        poly = poly.buffer(0)
    return None if poly.is_empty else poly


def main() -> None:
    a = parse_args()
    a.output_dir.mkdir(parents=True, exist_ok=True)

    meta = json.loads(a.metadata.read_text(encoding="utf-8"))
    bbox = meta["bbox_wgs84"]
    z = int(meta.get("zoom", 18))
    xmin, ymin, xmax, ymax = map(float, bbox)
    left_px, top_px = lonlat_to_world_px(xmin, ymax, z)
    right_px, bottom_px = lonlat_to_world_px(xmax, ymin, z)

    prob, signed_distance = reconstruct_inputs(a.seg_dir, a.date)
    h, w = prob.shape
    expected_w = right_px - left_px
    expected_h = bottom_px - top_px

    print("=== GEOREF QA ===")
    print(f"bbox_wgs84={bbox}")
    print(f"zoom={z}")
    print(f"raster={w}x{h}px")
    print(f"bbox_world_span={expected_w:.3f}x{expected_h:.3f}px")
    print(f"delta={w-expected_w:.3f}x{h-expected_h:.3f}px")

    instances = watershed_instances(
        prob, signed_distance, a.threshold, a.seed_distance_threshold, a.min_seed_px
    )

    rows = []
    for lab in range(1, int(instances.max()) + 1):
        mask = (instances == lab).astype(np.uint8)
        px_area = int(mask.sum())
        if px_area == 0:
            continue
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            poly = contour_to_wgs84(contour, left_px, top_px, z)
            if poly is None:
                continue
            ys, xs = np.where(mask > 0)
            vals = prob[ys, xs]
            rows.append({
                "date": a.date,
                "instance_id": int(lab),
                "pixel_area": px_area,
                "prob_mean": float(vals.mean()),
                "prob_p10": float(np.percentile(vals, 10)),
                "prob_p90": float(np.percentile(vals, 90)),
                "geometry": poly,
            })

    objects = gpd.GeoDataFrame(rows, geometry="geometry", crs=4326)
    productiva = gpd.read_file(a.productiva_parcels).to_crs(4326)
    if "partida" not in productiva.columns:
        raise SystemExit("La capa Productivo no contiene columna 'partida'")

    # Operación métrica en UTM 21S, adecuada para Almirante Brown.
    metric_crs = 32721
    obj_m = objects.to_crs(metric_crs)
    prod_m = productiva.to_crs(metric_crs)

    productiva_union = prod_m.geometry.union_all()
    obj_m["geometry"] = obj_m.geometry.intersection(productiva_union)
    obj_m = obj_m[~obj_m.geometry.is_empty].copy()
    obj_m["area_m2"] = obj_m.geometry.area
    obj_m = obj_m[obj_m["area_m2"] >= a.min_area_m2].copy()
    if a.simplify_m > 0:
        obj_m["geometry"] = obj_m.geometry.simplify(a.simplify_m, preserve_topology=True)

    joined = gpd.sjoin(
        obj_m,
        prod_m[["partida", "geometry"]],
        how="inner",
        predicate="intersects",
    ).drop(columns=["index_right"], errors="ignore")

    # Evitar doble asignación por bordes: asignar cada objeto a la parcela con mayor área de intersección.
    assignments = []
    prod_by_partida = {str(r.partida): r.geometry for _, r in prod_m.iterrows()}
    for idx, r in joined.iterrows():
        partida = str(r["partida"])
        inter_area = float(r.geometry.intersection(prod_by_partida[partida]).area)
        assignments.append((idx, partida, inter_area))
    assign_df = pd.DataFrame(assignments, columns=["idx", "partida", "inter_area_m2"])
    if not assign_df.empty:
        best = assign_df.sort_values("inter_area_m2", ascending=False).drop_duplicates("idx")
        obj_m = obj_m.loc[best["idx"]].copy()
        obj_m["partida"] = best.set_index("idx").loc[obj_m.index, "partida"].values
    else:
        obj_m = obj_m.iloc[0:0].copy()
        obj_m["partida"] = pd.Series(dtype=str)

    obj_wgs = obj_m.to_crs(4326)
    obj_wgs["object_id"] = [f"{a.date}-B{i:05d}" for i in range(1, len(obj_wgs) + 1)]

    out_geojson = a.output_dir / f"{a.date}-buildings-productivo.geojson"
    out_csv = a.output_dir / f"{a.date}-buildings-productivo.csv"
    out_summary = a.output_dir / f"{a.date}-buildings-productivo-by-parcel.csv"
    out_qa = a.output_dir / f"{a.date}-vectorization-qa.json"

    obj_wgs.to_file(out_geojson, driver="GeoJSON")
    obj_wgs.drop(columns="geometry").to_csv(out_csv, index=False)

    if len(obj_m):
        summary = (
            obj_m.groupby("partida", as_index=False)
            .agg(
                building_objects=("partida", "size"),
                building_area_m2=("area_m2", "sum"),
                mean_probability=("prob_mean", "mean"),
            )
            .sort_values("building_area_m2", ascending=False)
        )
    else:
        summary = pd.DataFrame(columns=["partida", "building_objects", "building_area_m2", "mean_probability"])
    summary.to_csv(out_summary, index=False)

    qa = {
        "date": a.date,
        "scope": "Productivo only",
        "bbox_wgs84": bbox,
        "zoom": z,
        "raster_width_px": w,
        "raster_height_px": h,
        "bbox_world_width_px": expected_w,
        "bbox_world_height_px": expected_h,
        "georef_delta_width_px": w - expected_w,
        "georef_delta_height_px": h - expected_h,
        "threshold": a.threshold,
        "seed_distance_threshold": a.seed_distance_threshold,
        "raw_instance_labels": int(instances.max()),
        "objects_inside_productivo": int(len(obj_wgs)),
        "building_area_inside_productivo_m2": float(obj_m["area_m2"].sum()) if len(obj_m) else 0.0,
        "productiva_parcels_with_buildings": int(obj_m["partida"].nunique()) if len(obj_m) else 0,
        "min_area_m2": a.min_area_m2,
        "simplify_m": a.simplify_m,
        "warning": "Edificios son una subcapa de transformación física; no equivalen por sí solos a loteo, venta o ilegalidad.",
    }
    out_qa.write_text(json.dumps(qa, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=== RESULTADO ===")
    print(json.dumps(qa, indent=2, ensure_ascii=False))
    print("GeoJSON:", out_geojson)
    print("CSV:", out_csv)
    print("Parcelas:", out_summary)
    print("QA:", out_qa)


if __name__ == "__main__":
    main()
