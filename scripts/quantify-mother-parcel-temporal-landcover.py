#!/usr/bin/env python3
"""Cuantifica la trayectoria temporal multi-clase en parcelas madre candidatas.

Usa los `landcover-argmax.png` persistidos por `road-semantic-openearthmap.py`
para medir, por fecha y por parcela candidata HIGH:
- Road
- Building
- Pavement
- Cropland
- Grass
- soporte Road sobre el footprint vial V5 2026

Objetivo: distinguir un camino/acceso rural preexistente de una transición hacia
urbanización observable. No determina aprobación, venta, irregularidad ni ilegalidad.
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
import json
from pathlib import Path

import cv2
import numpy as np
from shapely.geometry import shape

HERE = Path(__file__).resolve().parent
PANEL_PATH = HERE / "generate-mother-parcel-temporal-panels.py"
spec = importlib.util.spec_from_file_location("mother_panels", PANEL_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"No se pudo cargar {PANEL_PATH}")
panels = importlib.util.module_from_spec(spec)
spec.loader.exec_module(panels)

V2_PATH = HERE / "generate-earthwork-road-candidates-v2.py"
spec2 = importlib.util.spec_from_file_location("earthwork_road_v2", V2_PATH)
if spec2 is None or spec2.loader is None:
    raise RuntimeError(f"No se pudo cargar {V2_PATH}")
v2 = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(v2)

HISTORY_ROOT = v2.HISTORY_ROOT
DEFAULT_OPENEARTH = HISTORY_ROOT / "road-semantic-openearthmap"
DEFAULT_CANDIDATES = HISTORY_ROOT / "road-within-mother-parcel" / "road-within-mother-parcel-candidates.csv"
DEFAULT_V5_ROOT = HISTORY_ROOT / "internal-road-score-v5"
DEFAULT_OUTPUT = HISTORY_ROOT / "road-within-mother-parcel" / "temporal-landcover"
DEFAULT_GEOARBA = panels.DEFAULT_GEOARBA
DATES = panels.DATES


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--openearth-root", type=Path, default=DEFAULT_OPENEARTH)
    p.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    p.add_argument("--v5-root", type=Path, default=DEFAULT_V5_ROOT)
    p.add_argument("--metadata", type=Path, default=v2.DEFAULT_META)
    p.add_argument("--geoarba", nargs="+", type=Path, default=DEFAULT_GEOARBA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--max-parcels", type=int, default=10)
    p.add_argument("--road-support-threshold", type=float, default=0.35)
    return p.parse_args()


def read_gray(path: Path) -> np.ndarray:
    arr = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if arr is None:
        raise FileNotFoundError(path)
    return arr


def load_runtime_labels(openearth_root: Path, date: str) -> list[str]:
    qa = json.loads((openearth_root / date / "openearthmap-road-qa.json").read_text(encoding="utf-8"))
    labels = qa.get("labels_runtime")
    if not isinstance(labels, list) or "Road" not in labels or "Building" not in labels:
        raise RuntimeError(f"labels_runtime inválido para {date}: {labels}")
    return [str(x) for x in labels]


def first_date_at_or_above(values: dict[str, float], threshold: float) -> str | None:
    for d in DATES:
        if values.get(d, 0.0) >= threshold:
            return d
    return None


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    selected = panels.load_high_parcels(args.candidates, args.max_parcels)
    wanted = {r["nomenclatura"] for r in selected}
    geoms = panels.load_geometries(args.geoarba, wanted)
    if not selected:
        raise SystemExit("No hay parcelas HIGH en candidates CSV")

    # shape espacial a partir del primer argmax
    first_arg = read_gray(args.openearth_root / DATES[0] / "landcover-argmax.png")
    h, w = first_arg.shape[:2]
    meta = v2.load_json(args.metadata)

    high = read_gray(args.v5_root / "internal-road-high.png") > 0
    medium = read_gray(args.v5_root / "internal-road-medium.png") > 0
    current_road = high | medium

    argmax_by_date: dict[str, np.ndarray] = {}
    labels_by_date: dict[str, list[str]] = {}
    for d in DATES:
        arr = read_gray(args.openearth_root / d / "landcover-argmax.png")
        if arr.shape != (h, w):
            raise RuntimeError(f"shape inconsistente {d}: {arr.shape} vs {(h,w)}")
        argmax_by_date[d] = arr
        labels_by_date[d] = load_runtime_labels(args.openearth_root, d)

    rows: list[dict] = []
    parcel_reports: list[dict] = []
    for rank, selected_row in enumerate(selected, start=1):
        nomen = selected_row["nomenclatura"]
        if nomen not in geoms:
            continue
        geom, props = geoms[nomen]
        pmask = panels.geom_to_mask(geom, meta, (h, w))
        n_pix = int(pmask.sum())
        if n_pix == 0:
            continue
        footprint = current_road & pmask
        footprint_n = int(footprint.sum())

        road_support_by_date: dict[str, float] = {}
        building_by_date: dict[str, float] = {}
        road_by_date: dict[str, float] = {}
        pavement_by_date: dict[str, float] = {}
        crop_by_date: dict[str, float] = {}

        for d in DATES:
            labels = labels_by_date[d]
            arr = argmax_by_date[d]
            idx = {name: i for i, name in enumerate(labels)}
            metrics = {}
            for cls in ["Road", "Building", "Pavement", "Cropland", "Grass"]:
                if cls in idx:
                    metrics[cls] = float((arr[pmask] == idx[cls]).mean())
                else:
                    metrics[cls] = 0.0
            road_support = 0.0
            if footprint_n > 0:
                road_support = float((arr[footprint] == idx["Road"]).mean())

            road_support_by_date[d] = road_support
            road_by_date[d] = metrics["Road"]
            building_by_date[d] = metrics["Building"]
            pavement_by_date[d] = metrics["Pavement"]
            crop_by_date[d] = metrics["Cropland"]

            rows.append({
                "rank": rank,
                "nomenclatura": nomen,
                "partida": props.get("partida", ""),
                "date": d,
                "parcel_area_m2": props.get("superficie_m2", ""),
                "road_fraction": round(metrics["Road"], 6),
                "building_fraction": round(metrics["Building"], 6),
                "pavement_fraction": round(metrics["Pavement"], 6),
                "cropland_fraction": round(metrics["Cropland"], 6),
                "grass_fraction": round(metrics["Grass"], 6),
                "road_support_on_2026_v5_footprint": round(road_support, 6),
            })

        first_road_support = first_date_at_or_above(road_support_by_date, args.road_support_threshold)
        # Cambio de ocupación semántica, sólo descriptivo; no se fuerza una fecha jurídica.
        building_growth_2016_2026 = building_by_date[DATES[-1]] - building_by_date[DATES[0]]
        building_growth_2020_2022 = building_by_date["2022-03-01"] - building_by_date["2020-03-03"]
        road_growth_2020_2022 = road_by_date["2022-03-01"] - road_by_date["2020-03-03"]

        parcel_reports.append({
            "rank": rank,
            "nomenclatura": nomen,
            "partida": props.get("partida", ""),
            "parcel_area_m2": props.get("superficie_m2", ""),
            "priority_score": selected_row.get("priority_score", ""),
            "road_support_threshold": args.road_support_threshold,
            "first_date_road_support_ge_threshold": first_road_support,
            "road_support_on_2026_v5_footprint": {d: round(road_support_by_date[d], 6) for d in DATES},
            "road_fraction": {d: round(road_by_date[d], 6) for d in DATES},
            "building_fraction": {d: round(building_by_date[d], 6) for d in DATES},
            "pavement_fraction": {d: round(pavement_by_date[d], 6) for d in DATES},
            "cropland_fraction": {d: round(crop_by_date[d], 6) for d in DATES},
            "building_growth_2016_2026": round(building_growth_2016_2026, 6),
            "building_growth_2020_2022": round(building_growth_2020_2022, 6),
            "road_growth_2020_2022": round(road_growth_2020_2022, 6),
        })

    csv_path = args.output_dir / "mother-parcel-temporal-landcover.csv"
    if rows:
        with csv_path.open("w", newline="", encoding="utf-8-sig") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            wr.writeheader()
            wr.writerows(rows)

    report = {
        "scope": "Productivo only within Cluster 2 coverage",
        "dates": DATES,
        "method": "OpenEarthMap full argmax per date inside HIGH mother-parcel candidates + support on 2026 V5 road footprint",
        "road_support_threshold": args.road_support_threshold,
        "selected_parcels": len(parcel_reports),
        "status": "diagnostic temporal multi-class quantification; compare with directed visual QA",
        "warning": "Las clases OpenEarthMap son evidencia semántica auxiliar. Las fechas de soporte no equivalen a fecha de loteo, aprobación, subdivisión, venta ni irregularidad.",
        "parcels": parcel_reports,
    }
    qa_path = args.output_dir / "mother-parcel-temporal-landcover-qa.json"
    qa_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=== MOTHER PARCEL TEMPORAL LANDCOVER QA ===")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"csv={csv_path}")
    print(f"qa={qa_path}")


if __name__ == "__main__":
    main()
