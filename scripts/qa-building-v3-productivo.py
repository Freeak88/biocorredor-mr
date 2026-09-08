#!/usr/bin/env python3
"""Genera QA visual y comparación auxiliar con Overture para edificios V3 Productivo.

No altera artefactos existentes. Produce overlays/crops locales bajo --output-dir.
Overture es referencia auxiliar, no ground truth.
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
    p.add_argument("--image", type=Path, default=Path("tmp/territorial-analysis/cluster-02-history/registered-local/2023-04-19.jpg"))
    p.add_argument("--vectors", type=Path, default=Path("tmp/territorial-analysis/cluster-02-history/building-vectors-v3-productivo/2023-04-19-buildings-productivo.geojson"))
    p.add_argument("--metadata", type=Path, default=Path("config/territorial/cluster-02-georef.json"))
    p.add_argument("--overture", type=Path, default=Path("tmp/territorial-analysis/overture-buildings-bbox.geojson"))
    p.add_argument("--output-dir", type=Path, default=Path("tmp/territorial-analysis/cluster-02-history/building-vectors-v3-productivo/qa"))
    p.add_argument("--sample-size", type=int, default=40)
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


def draw_geom(draw: ImageDraw.ImageDraw, geom, left_px: float, top_px: float, z: int, outline, width: int = 2):
    for ring in geom_to_rings(geom, left_px, top_px, z):
        draw.line(ring + [ring[0]], fill=outline, width=width)


def safe_crop(image: Image.Image, box_coords: tuple[int, int, int, int], size: int) -> tuple[Image.Image, tuple[int, int]]:
    """Recorta sin relleno negro fuera del raster y devuelve el origen real usado."""
    w, h = image.size
    x0, y0, x1, y1 = box_coords
    if w <= size:
        x0 = 0
    else:
        x0 = max(0, min(x0, w - size))
    if h <= size:
        y0 = 0
    else:
        y0 = max(0, min(y0, h - size))
    x1 = min(w, x0 + size)
    y1 = min(h, y0 + size)
    crop = image.crop((x0, y0, x1, y1))
    if crop.size != (size, size):
        canvas = Image.new("RGB", (size, size), "white")
        canvas.paste(crop, (0, 0))
        crop = canvas
    return crop, (x0, y0)


def main() -> None:
    a = parse_args()
    a.output_dir.mkdir(parents=True, exist_ok=True)
    for p in [a.image, a.vectors, a.metadata]:
        if not p.exists():
            raise SystemExit(f"No existe: {p}")

    meta = json.loads(a.metadata.read_text(encoding="utf-8"))
    xmin, ymin, xmax, ymax = map(float, meta["bbox_wgs84"])
    z = int(meta.get("zoom", 18))
    left_px, top_px = lonlat_to_world_px(xmin, ymax, z)

    image = Image.open(a.image).convert("RGB")
    vectors = gpd.read_file(a.vectors).to_crs(4326)
    if vectors.empty:
        raise SystemExit("El GeoJSON V3 está vacío")

    overlay = image.copy()
    draw = ImageDraw.Draw(overlay)
    for _, row in vectors.iterrows():
        draw_geom(draw, row.geometry, left_px, top_px, z, (255, 64, 64), 2)

    overture = None
    overlap_stats = None
    if a.overture.exists():
        overture = gpd.read_file(a.overture).to_crs(4326)
        bbox_poly = box(xmin, ymin, xmax, ymax)
        overture = overture[overture.geometry.intersects(bbox_poly)].copy()
        for _, row in overture.iterrows():
            draw_geom(draw, row.geometry, left_px, top_px, z, (64, 220, 255), 1)

        metric = 32721
        v = vectors.to_crs(metric)
        o = overture.to_crs(metric)
        if not o.empty:
            ounion = o.geometry.union_all()
            v["overlap_overture_m2"] = v.geometry.intersection(ounion).area
            v["overture_overlap_fraction"] = v["overlap_overture_m2"] / v.geometry.area.clip(lower=1e-9)
            overlap_stats = {
                "overture_features_in_bbox": int(len(o)),
                "v3_objects_with_any_overture_overlap": int((v["overlap_overture_m2"] > 0).sum()),
                "v3_objects_overlap_ge_50pct": int((v["overture_overlap_fraction"] >= 0.5).sum()),
                "median_v3_fraction_overlapping_overture": float(v["overture_overlap_fraction"].median()),
            }
            vectors["overture_overlap_fraction"] = v["overture_overlap_fraction"].values

    full_path = a.output_dir / "2023-04-19-v3-productivo-overlay-full.jpg"
    overlay.save(full_path, quality=92)

    sort_cols = []
    if "area_m2" in vectors.columns:
        sort_cols.append("area_m2")
    ranked = vectors.sort_values(sort_cols, ascending=False) if sort_cols else vectors.copy()

    # Muestra intencional: mitad objetos grandes + mitad distribuida por índice.
    n = min(int(a.sample_size), len(ranked))
    n_large = n // 2
    selected = list(ranked.head(n_large).index)
    rest = ranked.drop(index=selected)
    if len(rest) and n > n_large:
        step = max(1, len(rest) // (n - n_large))
        selected.extend(list(rest.iloc[::step].head(n - n_large).index))

    crop_size = int(a.crop_size)
    cols = 4
    rows = math.ceil(len(selected) / cols)
    sheet = Image.new("RGB", (cols * crop_size, rows * crop_size), "white")
    font = ImageFont.load_default()

    sample_rows = []
    for pos, idx in enumerate(selected):
        row = vectors.loc[idx]
        c = row.geometry.centroid
        cxw, cyw = lonlat_to_world_px(float(c.x), float(c.y), z)
        cx, cy = cxw - left_px, cyw - top_px
        half = crop_size // 2
        requested_box = (int(cx - half), int(cy - half), int(cx + half), int(cy + half))
        crop, (ox, oy) = safe_crop(image, requested_box, crop_size)
        crop_box = (ox, oy, ox + crop_size, oy + crop_size)
        cd = ImageDraw.Draw(crop)

        # Dibujar todos los V3 que tocan el crop usando coordenadas locales.
        for _, r2 in vectors.iterrows():
            minx, miny, maxx, maxy = r2.geometry.bounds
            px1, py1 = lonlat_to_world_px(minx, maxy, z)
            px2, py2 = lonlat_to_world_px(maxx, miny, z)
            if px2 - left_px < crop_box[0] or px1 - left_px > crop_box[2] or py2 - top_px < crop_box[1] or py1 - top_px > crop_box[3]:
                continue
            for ring in geom_to_rings(r2.geometry, left_px, top_px, z):
                local = [(x - ox, y - oy) for x, y in ring]
                cd.line(local + [local[0]], fill=(255, 64, 64), width=2)

        if overture is not None:
            for _, r2 in overture.iterrows():
                minx, miny, maxx, maxy = r2.geometry.bounds
                px1, py1 = lonlat_to_world_px(minx, maxy, z)
                px2, py2 = lonlat_to_world_px(maxx, miny, z)
                if px2 - left_px < crop_box[0] or px1 - left_px > crop_box[2] or py2 - top_px < crop_box[1] or py1 - top_px > crop_box[3]:
                    continue
                for ring in geom_to_rings(r2.geometry, left_px, top_px, z):
                    local = [(x - ox, y - oy) for x, y in ring]
                    cd.line(local + [local[0]], fill=(64, 220, 255), width=1)

        label = f"#{pos+1} {row.get('object_id','')} area={float(row.get('area_m2',0)):.1f}m2"
        if "overture_overlap_fraction" in vectors.columns:
            label += f" ov={float(row.get('overture_overlap_fraction',0)):.2f}"
        cd.rectangle((0, 0, crop_size, 18), fill=(0, 0, 0))
        cd.text((4, 4), label, fill=(255, 255, 255), font=font)
        sheet.paste(crop, ((pos % cols) * crop_size, (pos // cols) * crop_size))

        sample_rows.append({
            "sample_rank": pos + 1,
            "object_id": row.get("object_id"),
            "partida": row.get("partida"),
            "nomenclatura": row.get("nomenclatura"),
            "area_m2": float(row.get("area_m2", 0.0)),
            "prob_mean": float(row.get("prob_mean", 0.0)),
            "overture_overlap_fraction": None if "overture_overlap_fraction" not in vectors.columns else float(row.get("overture_overlap_fraction", 0.0)),
        })

    sheet_path = a.output_dir / "2023-04-19-v3-productivo-qa-sample40.jpg"
    sheet.save(sheet_path, quality=94)

    qa = {
        "date": "2023-04-19",
        "scope": "Productivo only",
        "v3_objects": int(len(vectors)),
        "sample_size": int(len(selected)),
        "legend": {"red": "V3 detected building", "cyan": "Overture auxiliary footprint"},
        "overture_available": overture is not None,
        "overture_stats": overlap_stats,
        "sample": sample_rows,
        "warning": "Overture is auxiliary evidence, not ground truth. Visual QA must judge imagery first.",
    }
    qa_path = a.output_dir / "2023-04-19-v3-productivo-qa.json"
    qa_path.write_text(json.dumps(qa, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=== BUILDING V3 QA ===")
    print(json.dumps({k: v for k, v in qa.items() if k != "sample"}, indent=2, ensure_ascii=False))
    print("Full overlay:", full_path)
    print("Sample sheet:", sheet_path)
    print("QA JSON:", qa_path)


if __name__ == "__main__":
    main()
