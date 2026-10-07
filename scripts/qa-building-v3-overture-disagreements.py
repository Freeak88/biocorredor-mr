#!/usr/bin/env python3
"""Genera QA dirigido de desacuerdos entre V3 y Overture para Productivo 2023.

Selecciona:
- todos los objetos V3 sin solapamiento con Overture;
- luego los objetos con menor fracción de solapamiento hasta completar el panel.

Overture es evidencia auxiliar, no ground truth. El objetivo es concentrar la
revisión humana en falsos positivos, fusiones y omisiones/discordancias de fuente.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import geopandas as gpd
from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import box


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--image",
        type=Path,
        default=Path("tmp/territorial-analysis/cluster-02-history/registered-local/2023-04-19.jpg"),
    )
    p.add_argument(
        "--vectors",
        type=Path,
        default=Path(
            "tmp/territorial-analysis/cluster-02-history/building-vectors-v3-productivo/"
            "2023-04-19-buildings-productivo.geojson"
        ),
    )
    p.add_argument(
        "--metadata",
        type=Path,
        default=Path("config/territorial/cluster-02-georef.json"),
    )
    p.add_argument(
        "--overture",
        type=Path,
        default=Path("tmp/territorial-analysis/overture-buildings-bbox.geojson"),
    )
    p.add_argument(
        "--output-dir",
        type=Path,
        default=Path(
            "tmp/territorial-analysis/cluster-02-history/building-vectors-v3-productivo/qa-disagreements"
        ),
    )
    p.add_argument("--panel-size", type=int, default=40)
    p.add_argument("--crop-size", type=int, default=320)
    return p.parse_args()


def lonlat_to_world_px(lon: float, lat: float, z: int) -> tuple[float, float]:
    n = 256.0 * (2 ** z)
    x = (lon + 180.0) / 360.0 * n
    lat = max(min(lat, 85.05112878), -85.05112878)
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
    return x, y


def geom_to_rings(geom, left_px: float, top_px: float, z: int):
    if geom is None or geom.is_empty:
        return []
    geoms = [geom] if geom.geom_type == "Polygon" else list(getattr(geom, "geoms", []))
    rings = []
    for poly in geoms:
        if poly.geom_type != "Polygon":
            continue
        coords = []
        for lon, lat in poly.exterior.coords:
            x, y = lonlat_to_world_px(float(lon), float(lat), z)
            coords.append((x - left_px, y - top_px))
        if len(coords) >= 3:
            rings.append(coords)
    return rings


def safe_crop(image: Image.Image, x: float, y: float, size: int) -> tuple[Image.Image, tuple[int, int, int, int]]:
    w, h = image.size
    half = size // 2
    x0 = int(round(x)) - half
    y0 = int(round(y)) - half
    x0 = max(0, min(x0, max(0, w - size)))
    y0 = max(0, min(y0, max(0, h - size)))
    x1 = min(w, x0 + size)
    y1 = min(h, y0 + size)
    crop = image.crop((x0, y0, x1, y1))
    if crop.size != (size, size):
        canvas = Image.new("RGB", (size, size), "white")
        canvas.paste(crop, (0, 0))
        crop = canvas
    return crop, (x0, y0, x0 + size, y0 + size)


def intersects_crop(geom, crop_box, left_px: float, top_px: float, z: int) -> bool:
    minx, miny, maxx, maxy = geom.bounds
    px1, py1 = lonlat_to_world_px(minx, maxy, z)
    px2, py2 = lonlat_to_world_px(maxx, miny, z)
    gx0, gy0 = px1 - left_px, py1 - top_px
    gx1, gy1 = px2 - left_px, py2 - top_px
    x0, y0, x1, y1 = crop_box
    return not (gx1 < x0 or gx0 > x1 or gy1 < y0 or gy0 > y1)


def draw_local(draw, geom, crop_box, left_px: float, top_px: float, z: int, color, width: int):
    ox, oy = crop_box[0], crop_box[1]
    for ring in geom_to_rings(geom, left_px, top_px, z):
        local = [(x - ox, y - oy) for x, y in ring]
        draw.line(local + [local[0]], fill=color, width=width)


def main() -> None:
    a = parse_args()
    a.output_dir.mkdir(parents=True, exist_ok=True)

    for p in [a.image, a.vectors, a.metadata, a.overture]:
        if not p.exists():
            raise SystemExit(f"No existe: {p}")

    meta = json.loads(a.metadata.read_text(encoding="utf-8"))
    xmin, ymin, xmax, ymax = map(float, meta["bbox_wgs84"])
    z = int(meta.get("zoom", 18))
    left_px, top_px = lonlat_to_world_px(xmin, ymax, z)

    image = Image.open(a.image).convert("RGB")
    vectors = gpd.read_file(a.vectors).to_crs(4326)
    overture = gpd.read_file(a.overture).to_crs(4326)

    bbox_poly = box(xmin, ymin, xmax, ymax)
    overture = overture[overture.geometry.intersects(bbox_poly)].copy()
    if vectors.empty:
        raise SystemExit("El GeoJSON V3 está vacío")
    if overture.empty:
        raise SystemExit("No hay footprints Overture dentro del bbox")

    metric = 32721
    v = vectors.to_crs(metric).copy()
    o = overture.to_crs(metric)
    ounion = o.geometry.union_all()

    v["overlap_overture_m2"] = v.geometry.intersection(ounion).area
    v["overture_overlap_fraction"] = v["overlap_overture_m2"] / v.geometry.area.clip(lower=1e-9)
    vectors["overlap_overture_m2"] = v["overlap_overture_m2"].values
    vectors["overture_overlap_fraction"] = v["overture_overlap_fraction"].values

    vectors["disagreement_class"] = "overlap_ge_50pct"
    vectors.loc[vectors["overture_overlap_fraction"] < 0.5, "disagreement_class"] = "overlap_lt_50pct"
    vectors.loc[vectors["overlap_overture_m2"] <= 0.0, "disagreement_class"] = "no_overture_overlap"

    zero = vectors[vectors["overlap_overture_m2"] <= 0.0].copy()
    low = vectors[(vectors["overlap_overture_m2"] > 0.0) & (vectors["overture_overlap_fraction"] < 0.5)].copy()
    low = low.sort_values(["overture_overlap_fraction", "area_m2"], ascending=[True, False])

    selected = list(zero.sort_values("area_m2", ascending=False).index)
    remaining = max(0, int(a.panel_size) - len(selected))
    selected.extend(list(low.head(remaining).index))

    crop_size = int(a.crop_size)
    cols = 4
    rows = math.ceil(len(selected) / cols) if selected else 1
    sheet = Image.new("RGB", (cols * crop_size, rows * crop_size), "white")
    font = ImageFont.load_default()

    sample_rows = []
    for pos, idx in enumerate(selected):
        row = vectors.loc[idx]
        c = row.geometry.centroid
        cxw, cyw = lonlat_to_world_px(float(c.x), float(c.y), z)
        crop, crop_box = safe_crop(image, cxw - left_px, cyw - top_px, crop_size)
        cd = ImageDraw.Draw(crop)

        for _, r2 in vectors.iterrows():
            if intersects_crop(r2.geometry, crop_box, left_px, top_px, z):
                draw_local(cd, r2.geometry, crop_box, left_px, top_px, z, (255, 64, 64), 2)

        for _, r2 in overture.iterrows():
            if intersects_crop(r2.geometry, crop_box, left_px, top_px, z):
                draw_local(cd, r2.geometry, crop_box, left_px, top_px, z, (64, 220, 255), 1)

        ov = float(row["overture_overlap_fraction"])
        area = float(row.get("area_m2", 0.0))
        cls = str(row["disagreement_class"])
        label1 = f"#{pos+1} {row.get('object_id','')} {area:.1f}m2"
        label2 = f"ov={ov:.3f} {cls}"
        cd.rectangle((0, 0, crop_size, 34), fill=(0, 0, 0))
        cd.text((4, 3), label1, fill=(255, 255, 255), font=font)
        cd.text((4, 18), label2, fill=(255, 255, 255), font=font)
        sheet.paste(crop, ((pos % cols) * crop_size, (pos // cols) * crop_size))

        sample_rows.append(
            {
                "sample_rank": pos + 1,
                "object_id": row.get("object_id"),
                "partida": row.get("partida"),
                "nomenclatura": row.get("nomenclatura"),
                "area_m2": area,
                "prob_mean": float(row.get("prob_mean", 0.0)),
                "overture_overlap_fraction": ov,
                "overlap_overture_m2": float(row["overlap_overture_m2"]),
                "disagreement_class": cls,
            }
        )

    sheet_path = a.output_dir / "2023-04-19-v3-overture-disagreements.jpg"
    json_path = a.output_dir / "2023-04-19-v3-overture-disagreements.json"
    csv_path = a.output_dir / "2023-04-19-v3-overture-disagreements.csv"

    sheet.save(sheet_path, quality=94)

    qa = {
        "date": "2023-04-19",
        "scope": "Productivo only",
        "v3_objects": int(len(vectors)),
        "overture_features_in_bbox": int(len(overture)),
        "objects_no_overture_overlap": int(len(zero)),
        "objects_overlap_lt_50pct": int(len(low)),
        "panel_size": int(len(selected)),
        "selection": "all zero-overlap objects, then lowest overlap fractions below 0.5",
        "legend": {
            "red": "V3 detected surface",
            "cyan": "Overture auxiliary footprint",
        },
        "sample": sample_rows,
        "warning": "Overture is auxiliary evidence, not ground truth. A disagreement may be a V3 false positive, a fused complex, or an Overture omission/different representation.",
    }
    json_path.write_text(json.dumps(qa, indent=2, ensure_ascii=False), encoding="utf-8")

    vectors.loc[selected, [
        "object_id",
        "partida",
        "nomenclatura",
        "area_m2",
        "prob_mean",
        "overlap_overture_m2",
        "overture_overlap_fraction",
        "disagreement_class",
    ]].to_csv(csv_path, index=False)

    print("=== V3 VS OVERTURE DISAGREEMENT QA ===")
    print(json.dumps({k: v for k, v in qa.items() if k != "sample"}, indent=2, ensure_ascii=False))
    print("Panel:", sheet_path)
    print("JSON:", json_path)
    print("CSV:", csv_path)


if __name__ == "__main__":
    main()
