#!/usr/bin/env python3
"""Genera paneles temporales para la muestra humana estratificada de Cluster 2.

Lee `cluster02-human-qa-sample.csv` y produce:
- un panel temporal 2016/2020/2022/2023/2026 por parcela;
- un manifest CSV con la ruta del panel;
- una plantilla CSV de etiquetado humano separada de las features automáticas.

Scope duro: Productivo dentro de la cobertura real de Cluster 2.
El footprint vial V5 2026 se proyecta hacia atrás sólo como guía visual.
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
from pathlib import Path

import cv2
import numpy as np
from shapely.geometry import shape

HERE = Path(__file__).resolve().parent
BASE_PATH = HERE / "generate-mother-parcel-temporal-panels.py"
spec = importlib.util.spec_from_file_location("mother_panels", BASE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"No se pudo cargar {BASE_PATH}")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

v2 = base.v2
DATES = base.DATES
HISTORY_ROOT = v2.HISTORY_ROOT
DEFAULT_SAMPLE = HISTORY_ROOT / "observed-parcel-features/qa-strata/cluster02-human-qa-sample.csv"
DEFAULT_REGISTERED = HISTORY_ROOT / "registered-local"
DEFAULT_V5_ROOT = HISTORY_ROOT / "internal-road-score-v5"
DEFAULT_OUTPUT = HISTORY_ROOT / "observed-parcel-features/human-qa-panels"
DEFAULT_GEOARBA = base.DEFAULT_GEOARBA


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--sample", type=Path, default=DEFAULT_SAMPLE)
    p.add_argument("--registered-dir", type=Path, default=DEFAULT_REGISTERED)
    p.add_argument("--v5-root", type=Path, default=DEFAULT_V5_ROOT)
    p.add_argument("--metadata", type=Path, default=v2.DEFAULT_META)
    p.add_argument("--geoarba", nargs="+", type=Path, default=DEFAULT_GEOARBA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--padding-px", type=int, default=70)
    return p.parse_args()


def read_sample(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def load_geometries(paths: list[Path], wanted: set[str]) -> dict[str, tuple[object, dict]]:
    found: dict[str, tuple[object, dict]] = {}
    for path in paths:
        data = v2.load_json(path)
        for feature in data.get("features", []):
            props = feature.get("properties", {})
            n = str(props.get("nomenclatura") or "")
            if n in wanted and n not in found:
                try:
                    found[n] = (shape(feature["geometry"]), props)
                except Exception:
                    pass
    return found


def add_header(img: np.ndarray, line1: str, line2: str) -> np.ndarray:
    bar = np.full((68, img.shape[1], 3), 246, dtype=np.uint8)
    cv2.putText(bar, line1, (10, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.64, (20, 20, 20), 2, cv2.LINE_AA)
    cv2.putText(bar, line2, (10, 52), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (45, 45, 45), 1, cv2.LINE_AA)
    return np.vstack([bar, img])


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    sample = read_sample(args.sample)
    if not sample:
        raise SystemExit(f"Muestra vacía: {args.sample}")

    registered_dir = v2.resolve_registered_dir(args.registered_dir, DATES)
    images = {d: v2.read_image(registered_dir / f"{d}.jpg") for d in DATES}
    ref = images["2026-01-11"]
    h, w = ref.shape[:2]
    meta = v2.load_json(args.metadata)

    high = base.read_gray(args.v5_root / "internal-road-high.png") > 0
    medium = base.read_gray(args.v5_root / "internal-road-medium.png") > 0
    current_road = high | medium

    wanted = {str(r.get("nomenclatura") or "") for r in sample if r.get("nomenclatura")}
    geoms = load_geometries(args.geoarba, wanted)

    manifest: list[dict] = []
    labels: list[dict] = []

    for idx, row in enumerate(sample, start=1):
        nomen = str(row.get("nomenclatura") or "")
        partida = str(row.get("partida") or "")
        stratum = str(row.get("qa_stratum") or "")
        if nomen not in geoms:
            print(f"SKIP sin geometría: {nomen}")
            continue

        geom, props = geoms[nomen]
        pmask = base.geom_to_mask(geom, meta, (h, w))
        road_mask = current_road & pmask
        x0, y0, x1, y1 = base.crop_bbox(pmask, args.padding_px, (h, w))
        boundary = cv2.morphologyEx(
            pmask.astype(np.uint8), cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)
        ) > 0

        panels = []
        for d in DATES:
            img = images[d].copy().astype(np.float32)
            img[road_mask] = 0.42 * img[road_mask] + 0.58 * np.array([255, 0, 255], np.float32)
            img[boundary] = 0.18 * img[boundary] + 0.82 * np.array([255, 255, 0], np.float32)
            crop = np.clip(img[y0:y1, x0:x1], 0, 255).astype(np.uint8)
            crop = base.fit_panel(crop, target_h=560)
            crop = base.add_header(crop, d)
            panels.append(crop)

        max_h = max(p.shape[0] for p in panels)
        norm = []
        for p in panels:
            if p.shape[0] < max_h:
                pad = np.full((max_h - p.shape[0], p.shape[1], 3), 245, np.uint8)
                p = np.vstack([p, pad])
            norm.append(p)
        sheet = np.hstack(norm)

        title = np.full((82, sheet.shape[1], 3), 250, dtype=np.uint8)
        cv2.putText(
            title,
            f"#{idx:02d} partida={partida} | estrato={stratum}",
            (14, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.72, (15, 15, 15), 2, cv2.LINE_AA,
        )
        cv2.putText(
            title,
            "cian=limite GeoARBA actual | magenta=footprint vial V5 2026 (guia visual, no fecha histórica)",
            (14, 59), cv2.FONT_HERSHEY_SIMPLEX, 0.54, (45, 45, 45), 1, cv2.LINE_AA,
        )
        sheet = np.vstack([title, sheet])

        safe = nomen.replace("/", "_")
        out = args.output_dir / f"qa-{idx:02d}-{stratum}-{safe}.jpg"
        cv2.imwrite(str(out), sheet, [cv2.IMWRITE_JPEG_QUALITY, 92])

        manifest.append({
            "sample_index": idx,
            "partida": partida,
            "nomenclatura": nomen,
            "qa_stratum": stratum,
            "reasons": row.get("reasons", ""),
            "panel": str(out),
        })
        labels.append({
            "sample_index": idx,
            "partida": partida,
            "nomenclatura": nomen,
            "qa_stratum": stratum,
            "physical_loteo_signal": "",
            "internal_roads_visible": "",
            "occupation_change_visible": "",
            "subdivision_pattern_visible": "",
            "confidence": "",
            "notes": "",
        })
        print(f"panel {idx}/{len(sample)}: {out}")

    manifest_path = args.output_dir / "cluster02-human-qa-panels-manifest.csv"
    labels_path = args.output_dir / "cluster02-human-qa-label-template.csv"

    if manifest:
        with manifest_path.open("w", newline="", encoding="utf-8-sig") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(manifest[0].keys()))
            wr.writeheader(); wr.writerows(manifest)
    if labels:
        with labels_path.open("w", newline="", encoding="utf-8-sig") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(labels[0].keys()))
            wr.writeheader(); wr.writerows(labels)

    print("=== CLUSTER 2 HUMAN QA PANELS ===")
    print(f"sample_rows={len(sample)}")
    print(f"panels_generated={len(manifest)}")
    print(f"output_dir={args.output_dir}")
    print(f"manifest={manifest_path}")
    print(f"label_template={labels_path}")


if __name__ == "__main__":
    main()
