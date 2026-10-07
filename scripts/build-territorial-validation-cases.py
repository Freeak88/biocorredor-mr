#!/usr/bin/env python3
"""Build the 40-case territorial validation layer from the backcast sample.

Inputs are intentionally external to git because the historical imagery and
Overture extracts live in tmp/ during analysis.

Example:
  python scripts/build-territorial-validation-cases.py \
    --sample tmp/territorial-analysis/cluster-02-history/cluster-02-validation-sample.csv \
    --buildings tmp/territorial-analysis/overture-buildings-bbox.geojson \
    --output public/data/auditoria/territorial-validation-cases.geojson
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd

DATE_KEYS = [
    ("2016-11-30", "2016"),
    ("2020-03-03", "2020"),
    ("2022-03-01", "2022"),
    ("2023-04-19", "2023"),
    ("2026-01-11", "2026"),
]


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser()
    p.add_argument("--sample", required=True)
    p.add_argument("--buildings", required=True)
    p.add_argument("--output", required=True)
    return p


def finite_or_none(value):
    try:
        if pd.isna(value):
            return None
        return float(value)
    except Exception:
        return None


def main() -> None:
    args = parser().parse_args()
    sample = pd.read_csv(args.sample)
    buildings = gpd.read_file(args.buildings).to_crs(4326)

    required = {"overture_id", "group", "partida", "building_area_m2"}
    missing = required - set(sample.columns)
    if missing:
        raise SystemExit(f"Missing sample columns: {sorted(missing)}")

    chosen = buildings[buildings["overture_id"].isin(sample["overture_id"])][
        ["overture_id", "geometry"]
    ].copy()
    merged = chosen.merge(sample, on="overture_id", how="inner")
    merged = gpd.GeoDataFrame(merged, geometry="geometry", crs=4326)

    if len(merged) != len(sample):
        raise SystemExit(
            f"Expected {len(sample)} validation cases, got {len(merged)} after geometry join"
        )

    features = []
    for idx, row in merged.reset_index(drop=True).iterrows():
        centroid = row.geometry.centroid
        case_id = f"VAL-{idx + 1:03d}"
        props = {
            "case_id": case_id,
            "status": "pending",
            "sample_group": row.get("group"),
            "overture_id": row.get("overture_id"),
            "partida": None if pd.isna(row.get("partida")) else str(row.get("partida")),
            "nomenclatura": None if pd.isna(row.get("nomenclatura")) else str(row.get("nomenclatura")),
            "building_area_m2": finite_or_none(row.get("building_area_m2")),
            "lat": float(centroid.y),
            "lng": float(centroid.x),
            "validation": {
                "visible_2016": None,
                "visible_2020": None,
                "visible_2022": None,
                "visible_2023": None,
                "visible_2026": None,
                "confidence": None,
                "apparent_type": None,
                "final_label": None,
                "notes": "",
            },
            "scores": {},
        }
        for date, short in DATE_KEYS:
            props["scores"][short] = {
                "similarity_2026": finite_or_none(
                    row.get(f"{date}_similarity_2026")
                ),
                "support_vs_2026": finite_or_none(
                    row.get(f"{date}_support_vs_2026")
                ),
            }

        features.append(
            {
                "type": "Feature",
                "geometry": json.loads(gpd.GeoSeries([row.geometry], crs=4326).to_json())["features"][0]["geometry"],
                "properties": props,
            }
        )

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "type": "FeatureCollection",
        "metadata": {
            "kind": "territorial_validation_sample",
            "cluster_id": 2,
            "case_count": len(features),
            "capture_dates": [date for date, _ in DATE_KEYS],
            "purpose": "Human validation of historical visibility for current Overture building footprints",
        },
        "features": features,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"SAVED {out} ({len(features)} cases)")


if __name__ == "__main__":
    main()
