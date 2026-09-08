#!/usr/bin/env python3
"""Vectoriza la segmentación V3 oficial y la restringe al suelo Productivo.

La georreferenciación se reconstruye desde bbox_wgs84 + z18 usando world pixels
Web Mercator. El universo Productivo se toma de la geometría final versionada de
la Ordenanza 11.819/20 y cada polígono Productivo se vincula por máxima superposición
a la parcela GeoARBA correspondiente para recuperar partida/nomenclatura.

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
DEFAULT_PRODUCTIVA = Path("public/data/auditoria/zonificacion-11819-productiva.geojson.gz")
DEFAULT_GEOARBA = [
    Path("public/data/geoarba/ministro-rivadavia-parcels-noroeste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-noreste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-suroeste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-sureste.geojson"),
]
EXPECTED_PRODUCTIVA_PARCELS = 520


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--seg-dir", type=Path, required=True)
    p.add_argument("--date", default="2023-04-19")
    p.add_argument("--metadata", type=Path, default=DEFAULT_META)
    p.add_argument("--productiva", type=Path, default=DEFAULT_PRODUCTIVA)
    p.add_argument("--geoarba", type=Path, nargs="+", default=DEFAULT_GEOARBA)
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


def load_geojson(path: Path) -> gpd.GeoDataFrame:
    if path.suffix.lower() == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            data = json.load(fh)
        return gpd.GeoDataFrame.from_features(data.get("features", []), crs=4326)
    return gpd.read_file(path).to_crs(4326)


def norm_id(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in {"nan", "none"}:
        return ""
    return text


def load_productiva_parcels(productiva_path: Path, geoarba_paths: list[Path]) -> gpd.GeoDataFrame:
    productiva_geom = load_geojson(productiva_path).to_crs(4326)
    if len(productiva_geom) != EXPECTED_PRODUCTIVA_PARCELS:
        raise SystemExit(
            "La capa Productivo no contiene el universo esperado: "
            f"esperadas={EXPECTED_PRODUCTIVA_PARCELS}, encontradas={len(productiva_geom)}"
        )

    frames = []
    for path in geoarba_paths:
        if not path.exists():
            raise SystemExit(f"No existe capa GeoARBA: {path}")
        g = gpd.read_file(path).to_crs(4326)
        if "partida" not in g.columns and "nomenclatura" not in g.columns:
            raise SystemExit(f"GeoARBA sin partida/nomenclatura: {path}")
        g = g.copy()
        g["partida"] = g["partida"].map(norm_id) if "partida" in g.columns else ""
        g["nomenclatura"] = g["nomenclatura"].map(norm_id) if "nomenclatura" in g.columns else ""
        frames.append(g[["partida", "nomenclatura", "geometry"]])

    geoarba = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), geometry="geometry", crs=4326)
    geoarba["_key"] = np.where(
        geoarba["partida"] != "",
        "P:" + geoarba["partida"],
        "N:" + geoarba["nomenclatura"],
    )
    geoarba = geoarba.drop_duplicates("_key").copy()

    metric_crs = 32721
    prod_m = productiva_geom.to_crs(metric_crs).reset_index(drop=True)
    geo_m = geoarba.to_crs(metric_crs).reset_index(drop=True)

    pairs = gpd.sjoin(
        prod_m[["geometry"]],
        geo_m[["partida", "nomenclatura", "geometry"]],
        how="left",
        predicate="intersects",
    )
    if pairs.empty:
        raise SystemExit("No hubo intersecciones entre Productivo y GeoARBA")

    candidates = []
    for prod_idx, row in pairs.iterrows():
        geo_idx = row.get("index_right")
        if pd.isna(geo_idx):
            continue
        geo_idx = int(geo_idx)
        inter_area = float(prod_m.loc[prod_idx, "geometry"].intersection(geo_m.loc[geo_idx, "geometry"]).area)
        prod_area = float(prod_m.loc[prod_idx, "geometry"].area)
        coverage = inter_area / prod_area if prod_area > 0 else 0.0
        candidates.append(
            {
                "prod_idx": int(prod_idx),
                "geo_idx": geo_idx,
                "partida": str(geo_m.loc[geo_idx, "partida"]),
                "nomenclatura": str(geo_m.loc[geo_idx, "nomenclatura"]),
                "inter_area_m2": inter_area,
                "coverage": coverage,
            }
        )

    cand = pd.DataFrame(candidates)
    if cand.empty:
        raise SystemExit("No se pudieron vincular geometrías Productivo con GeoARBA")

    best = cand.sort_values(["prod_idx", "inter_area_m2"], ascending=[True, False]).drop_duplicates("prod_idx")
    if len(best) != EXPECTED_PRODUCTIVA_PARCELS:
        missing = sorted(set(range(EXPECTED_PRODUCTIVA_PARCELS)) - set(best["prod_idx"]))
        raise SystemExit(
            "No se resolvieron las 520 geometrías Productivo contra GeoARBA: "
            f"resueltas={len(best)}, faltantes={missing[:20]}"
        )

    weak = best[best["coverage"] < 0.999]
    if len(weak):
        sample = weak[["prod_idx", "partida", "nomenclatura", "coverage"]].head(10).to_dict("records")
        raise SystemExit(
            "Hay geometrías Productivo sin coincidencia GeoARBA >=99.9%: "
            f"cantidad={len(weak)}, muestra={sample}"
        )

    out = prod_m.copy()
    lookup = best.set_index("prod_idx")
    out["partida"] = [lookup.loc[i, "partida"] for i in out.index]
    out["nomenclatura"] = [lookup.loc[i, "nomenclatura"] for i in out.index]
    out["geoarba_match_coverage"] = [float(lookup.loc[i, "coverage"]) for i in out.index]
    out = out.to_crs(4326)

    if out["partida"].replace("", np.nan).dropna().nunique() != EXPECTED_PRODUCTIVA_PARCELS:
        raise SystemExit(
            "Las 520 geometrías Productivo no resolvieron a 520 partidas únicas; "
            "se requiere revisar duplicados o nomenclaturas sin partida."
        )

    return out


def reconstruct_inputs(seg_dir: Path, date: str) -> tuple[np.ndarray, np.ndarray]:
    prob = load_gray(seg_dir / f"{date}-building-prob.png").astype(np.float32) / 255.0
    dist = load_gray(seg_dir / f"{date}-building-distance.png").astype(np.float32) / 255.0 * 2.0 - 1.0
    return prob, dist


def watershed_instances(prob: np.ndarray, signed_distance: np.ndarray, threshold: float,
                        seed_distance_threshold: float, min_seed_px: int) -> np.ndarray:
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

    productiva = load_productiva_parcels(a.productiva, list(a.geoarba))
    print(f"productiva_parcels_resolved={len(productiva)}")
    print(f"productiva_match_min={productiva['geoarba_match_coverage'].min():.6f}")

    instances = watershed_instances(
        prob, signed_distance, a.threshold, a.seed_distance_threshold, a.min_seed_px
    )

    rows = []
    for lab in range(1, int(instances.max()) + 1):
        mask = (instances == lab).astype(np.uint8)
        if not mask.any():
            continue
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        ys, xs = np.where(mask > 0)
        vals = prob[ys, xs]
        for contour in contours:
            poly = contour_to_wgs84(contour, left_px, top_px, z)
            if poly is None:
                continue
            rows.append({
                "date": a.date,
                "instance_id": int(lab),
                "pixel_area": int(mask.sum()),
                "prob_mean": float(vals.mean()),
                "prob_p10": float(np.percentile(vals, 10)),
                "prob_p90": float(np.percentile(vals, 90)),
                "geometry": poly,
            })

    objects = gpd.GeoDataFrame(rows, geometry="geometry", crs=4326)

    metric_crs = 32721
    obj_m = objects.to_crs(metric_crs)
    prod_m = productiva.to_crs(metric_crs)

    # Scope lock: sólo las 520 parcelas Productivo forman el universo.
    # Nada fuera de la unión exacta de esas geometrías sobrevive al recorte.
    productiva_union = prod_m.geometry.union_all()
    obj_m["geometry"] = obj_m.geometry.intersection(productiva_union)
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

    assignments = []
    prod_by_key = {
        (str(r.partida), str(r.nomenclatura)): r.geometry
        for _, r in prod_m.iterrows()
    }
    for idx, r in joined.iterrows():
        partida = str(r["partida"])
        nomenclatura = str(r["nomenclatura"])
        area = float(r.geometry.intersection(prod_by_key[(partida, nomenclatura)]).area)
        assignments.append((idx, partida, nomenclatura, area))
    assign_df = pd.DataFrame(
        assignments,
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
            columns=["partida", "nomenclatura", "building_objects", "building_area_m2", "mean_probability"]
        )
    summary.to_csv(out_summary, index=False)

    qa = {
        "date": a.date,
        "scope": "Productivo only",
        "productiva_membership_source": str(a.productiva),
        "productiva_geometry_source": str(a.productiva),
        "geoarba_sources": [str(p) for p in a.geoarba],
        "productiva_parcel_count": int(len(productiva)),
        "productiva_geoarba_match_min": float(productiva["geoarba_match_coverage"].min()),
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
