#!/usr/bin/env python3
"""Vectoriza la segmentación V3 oficial y la restringe al suelo Productivo.

Fuentes de alcance espacial:
- membresía parcelaria: zones['productiva'] del archivo final de asignaciones;
- geometría parcelaria: GeoARBA actual, resuelta por nomenclatura exacta;
- máscara espacial final: intersección entre la unión de esas 520 parcelas y la
  geometría Productivo disuelta versionada.

Los edificios son una subcapa de transformación física observable; no prueban por
sí solos loteo, venta, aprobación ni ilegalidad.
"""
from __future__ import annotations

import argparse
import gzip
import json
import math
from pathlib import Path

import cv2
import geopandas as gpd
import numpy as np
import pandas as pd
from scipy import ndimage
from shapely.geometry import Polygon

DEFAULT_META = Path("config/territorial/cluster-02-georef.json")
DEFAULT_ASSIGNMENTS = Path("public/data/auditoria/zonificacion-11819-asignaciones.json.gz")
DEFAULT_PRODUCTIVA_MASK = Path("public/data/auditoria/zonificacion-11819-productiva.geojson.gz")
DEFAULT_GEOARBA = [
    Path("public/data/geoarba/ministro-rivadavia-parcels-noroeste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-noreste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-suroeste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-sureste.geojson"),
]
EXPECTED_PRODUCTIVA_PARCELS = 520
METRIC_CRS = 32721


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--seg-dir", type=Path, required=True)
    p.add_argument("--date", default="2023-04-19")
    p.add_argument("--metadata", type=Path, default=DEFAULT_META)
    p.add_argument("--assignments", type=Path, default=DEFAULT_ASSIGNMENTS)
    p.add_argument("--productiva-mask", type=Path, default=DEFAULT_PRODUCTIVA_MASK)
    p.add_argument("--geoarba", type=Path, nargs="+", default=DEFAULT_GEOARBA)
    p.add_argument("--output-dir", type=Path, required=True)
    p.add_argument("--threshold", type=float, default=0.4371)
    p.add_argument("--seed-distance-threshold", type=float, default=0.20)
    p.add_argument("--min-seed-px", type=int, default=6)
    p.add_argument("--min-area-m2", type=float, default=2.6465)
    p.add_argument("--simplify-m", type=float, default=0.9626)
    return p.parse_args()


def load_json(path: Path):
    if path.suffix.lower() == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            return json.load(fh)
    return json.loads(path.read_text(encoding="utf-8"))


def load_geojson(path: Path) -> gpd.GeoDataFrame:
    if path.suffix.lower() == ".gz":
        data = load_json(path)
        return gpd.GeoDataFrame.from_features(data.get("features", []), crs=4326)
    return gpd.read_file(path).to_crs(4326)


def norm_id(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text.lower() in {"nan", "none"} else text


def load_productiva_parcels(assignments_path: Path, geoarba_paths: list[Path]) -> gpd.GeoDataFrame:
    data = load_json(assignments_path)
    zones = data.get("zones") if isinstance(data, dict) else None
    if not isinstance(zones, dict) or not isinstance(zones.get("productiva"), list):
        raise SystemExit(
            f"Estructura inesperada en {assignments_path}: se esperaba zones['productiva'] como lista"
        )

    productiva_ids = [norm_id(v) for v in zones["productiva"] if norm_id(v)]
    if len(productiva_ids) != EXPECTED_PRODUCTIVA_PARCELS:
        raise SystemExit(
            "La membresía Productivo no contiene el universo esperado: "
            f"esperadas={EXPECTED_PRODUCTIVA_PARCELS}, encontradas={len(productiva_ids)}"
        )
    if len(set(productiva_ids)) != EXPECTED_PRODUCTIVA_PARCELS:
        raise SystemExit("La membresía Productivo contiene nomenclaturas duplicadas")

    wanted = set(productiva_ids)
    frames = []
    for path in geoarba_paths:
        if not path.exists():
            raise SystemExit(f"No existe capa GeoARBA: {path}")
        g = gpd.read_file(path).to_crs(4326)
        if "nomenclatura" not in g.columns:
            raise SystemExit(f"GeoARBA sin nomenclatura: {path}")
        g = g.copy()
        g["nomenclatura"] = g["nomenclatura"].map(norm_id)
        if "partida" in g.columns:
            g["partida"] = g["partida"].map(norm_id)
        else:
            g["partida"] = ""
        keep = g["nomenclatura"].isin(wanted)
        if keep.any():
            frames.append(g.loc[keep, ["partida", "nomenclatura", "geometry"]].copy())

    if not frames:
        raise SystemExit("No se encontró ninguna parcela Productivo en las capas GeoARBA")

    out = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), geometry="geometry", crs=4326)
    out = out.drop_duplicates("nomenclatura").copy()

    resolved = set(out["nomenclatura"])
    missing = sorted(wanted - resolved)
    extra = sorted(resolved - wanted)
    if len(out) != EXPECTED_PRODUCTIVA_PARCELS or missing or extra:
        raise SystemExit(
            "Productivo no resolvió exactamente contra GeoARBA: "
            f"esperadas={EXPECTED_PRODUCTIVA_PARCELS}, resueltas={len(out)}, "
            f"faltantes={missing[:10]}, extras={extra[:10]}"
        )

    # Mantener el orden canónico del archivo final de asignaciones.
    order = {n: i for i, n in enumerate(productiva_ids)}
    out["_order"] = out["nomenclatura"].map(order)
    out = out.sort_values("_order").drop(columns="_order").reset_index(drop=True)
    return out


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
    prob = load_gray(seg_dir / f"{date}-building-prob.png").astype(np.float32) / 255.0
    dist = load_gray(seg_dir / f"{date}-building-distance.png").astype(np.float32) / 255.0 * 2.0 - 1.0
    return prob, dist


def watershed_instances(
    prob: np.ndarray,
    signed_distance: np.ndarray,
    threshold: float,
    seed_distance_threshold: float,
    min_seed_px: int,
) -> np.ndarray:
    foreground = prob >= threshold
    seeds = foreground & (signed_distance >= seed_distance_threshold)
    labels, n = ndimage.label(seeds)
    if n:
        counts = np.bincount(labels.ravel())
        small = np.where(counts < min_seed_px)[0]
        if len(small):
            labels[np.isin(labels, small)] = 0
        labels, _ = ndimage.label(labels > 0)

    if labels.max() == 0:
        labels, _ = ndimage.label(foreground)

    energy = np.clip(
        (1.0 - prob) * 180.0 + (1.0 - (signed_distance + 1.0) / 2.0) * 75.0,
        0,
        255,
    )
    img = cv2.cvtColor(energy.astype(np.uint8), cv2.COLOR_GRAY2BGR)
    markers = labels.astype(np.int32) + 1
    markers[~foreground] = 1
    markers[foreground & (labels == 0)] = 0
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
    bbox = list(map(float, meta["bbox_wgs84"]))
    z = int(meta.get("zoom", 18))
    xmin, ymin, xmax, ymax = bbox
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

    productiva = load_productiva_parcels(a.assignments, list(a.geoarba))
    print(f"productiva_parcels_resolved={len(productiva)}")

    prod_m = productiva.to_crs(METRIC_CRS)
    parcel_union = prod_m.geometry.union_all()

    mask = load_geojson(a.productiva_mask).to_crs(METRIC_CRS)
    if mask.empty:
        raise SystemExit(f"Máscara Productivo vacía: {a.productiva_mask}")
    dissolved_mask = mask.geometry.union_all()

    # El indicador sólo usa el área que simultáneamente pertenece al universo
    # parcelario Productivo final y a la máscara Productivo disuelta.
    scope_geom = parcel_union.intersection(dissolved_mask)
    if scope_geom.is_empty:
        raise SystemExit("La intersección entre parcelas Productivo y máscara disuelta es vacía")

    parcel_union_area = float(parcel_union.area)
    mask_area = float(dissolved_mask.area)
    scope_area = float(scope_geom.area)
    parcel_coverage = scope_area / parcel_union_area if parcel_union_area else 0.0
    mask_coverage = scope_area / mask_area if mask_area else 0.0

    print(f"productiva_parcel_union_area_ha={parcel_union_area / 10000.0:.6f}")
    print(f"productiva_mask_area_ha={mask_area / 10000.0:.6f}")
    print(f"productiva_scope_area_ha={scope_area / 10000.0:.6f}")
    print(f"productiva_scope_vs_parcels={parcel_coverage:.6f}")
    print(f"productiva_scope_vs_mask={mask_coverage:.6f}")

    instances = watershed_instances(
        prob, signed_distance, a.threshold, a.seed_distance_threshold, a.min_seed_px
    )

    rows = []
    for lab in range(1, int(instances.max()) + 1):
        inst_mask = (instances == lab).astype(np.uint8)
        if not inst_mask.any():
            continue
        contours, _ = cv2.findContours(inst_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        ys, xs = np.where(inst_mask > 0)
        vals = prob[ys, xs]
        for contour in contours:
            poly = contour_to_wgs84(contour, left_px, top_px, z)
            if poly is None:
                continue
            rows.append(
                {
                    "date": a.date,
                    "instance_id": int(lab),
                    "pixel_area": int(inst_mask.sum()),
                    "prob_mean": float(vals.mean()),
                    "prob_p10": float(np.percentile(vals, 10)),
                    "prob_p90": float(np.percentile(vals, 90)),
                    "geometry": poly,
                }
            )

    objects = gpd.GeoDataFrame(rows, geometry="geometry", crs=4326)
    obj_m = objects.to_crs(METRIC_CRS)

    # Scope lock estricto: todo lo que quede fuera de Productivo desaparece.
    obj_m["geometry"] = obj_m.geometry.intersection(scope_geom)
    obj_m = obj_m[~obj_m.geometry.is_empty].copy()
    obj_m["area_m2"] = obj_m.geometry.area
    obj_m = obj_m[obj_m["area_m2"] >= a.min_area_m2].copy()
    if a.simplify_m > 0 and len(obj_m):
        obj_m["geometry"] = obj_m.geometry.simplify(a.simplify_m, preserve_topology=True)

    joined = gpd.sjoin(
        obj_m,
        prod_m[["partida", "nomenclatura", "geometry"]],
        how="inner",
        predicate="intersects",
    ).drop(columns=["index_right"], errors="ignore")

    candidates = []
    prod_lookup = {
        (str(r.partida), str(r.nomenclatura)): r.geometry
        for _, r in prod_m.iterrows()
    }
    for idx, row in joined.iterrows():
        partida = str(row["partida"])
        nomenclatura = str(row["nomenclatura"])
        area = float(row.geometry.intersection(prod_lookup[(partida, nomenclatura)]).area)
        candidates.append((idx, partida, nomenclatura, area))

    assign_df = pd.DataFrame(
        candidates,
        columns=["idx", "partida", "nomenclatura", "inter_area_m2"],
    )
    if not assign_df.empty:
        best = assign_df.sort_values("inter_area_m2", ascending=False).drop_duplicates("idx")
        obj_m = obj_m.loc[best["idx"]].copy()
        lookup = best.set_index("idx")
        obj_m["partida"] = [lookup.loc[i, "partida"] for i in obj_m.index]
        obj_m["nomenclatura"] = [lookup.loc[i, "nomenclatura"] for i in obj_m.index]
    else:
        obj_m = obj_m.iloc[0:0].copy()
        obj_m["partida"] = pd.Series(dtype=str)
        obj_m["nomenclatura"] = pd.Series(dtype=str)

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
            obj_m.groupby(["partida", "nomenclatura"], as_index=False)
            .agg(
                building_objects=("partida", "size"),
                building_area_m2=("area_m2", "sum"),
                mean_probability=("prob_mean", "mean"),
            )
            .sort_values("building_area_m2", ascending=False)
        )
    else:
        summary = pd.DataFrame(
            columns=[
                "partida",
                "nomenclatura",
                "building_objects",
                "building_area_m2",
                "mean_probability",
            ]
        )
    summary.to_csv(out_summary, index=False)

    qa = {
        "date": a.date,
        "scope": "Productivo only",
        "productiva_membership_source": str(a.assignments),
        "productiva_mask_source": str(a.productiva_mask),
        "productiva_geometry_source": [str(p) for p in a.geoarba],
        "productiva_parcel_count": int(len(productiva)),
        "productiva_parcel_union_area_ha": parcel_union_area / 10000.0,
        "productiva_mask_area_ha": mask_area / 10000.0,
        "productiva_scope_area_ha": scope_area / 10000.0,
        "productiva_scope_vs_parcels": parcel_coverage,
        "productiva_scope_vs_mask": mask_coverage,
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
        "productiva_parcels_with_buildings": int(obj_m["nomenclatura"].nunique()) if len(obj_m) else 0,
        "min_area_m2": a.min_area_m2,
        "simplify_m": a.simplify_m,
        "warning": "Edificios son sólo una subcapa de transformación física; no equivalen por sí solos a loteo, venta o ilegalidad.",
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
