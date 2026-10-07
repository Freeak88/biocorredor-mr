#!/usr/bin/env python3
"""Agrega features para todas las parcelas Productivo realmente observadas en Cluster 2.

No extrapola fuera de la cobertura VHR ni asigna cero a parcelas Productivo no
observadas. Las métricas de superficie son proxies raster dentro del scope
Productivo efectivo del mosaico.

Integra por fecha OpenEarthMap (`Road`, `Building`, `Pavement`), soporte histórico
sobre el footprint vial V5 2026 y, cuando existen, los segmentos de corredor vial
interno ya rankeados.

La salida NO calcula `physical_loteo_score` final ni tiene interpretación legal,
comercial o administrativa.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import importlib.util
import json
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
RANK_PATH = HERE / "rank-road-within-mother-parcel.py"
spec = importlib.util.spec_from_file_location("rank_mother", RANK_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"No se pudo cargar {RANK_PATH}")
rankmod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rankmod)

v2 = rankmod.v2
DATES = ["2016-11-30", "2020-03-03", "2022-03-01", "2023-04-19", "2026-01-11"]
YEAR = {d: d[:4] for d in DATES}
M_PER_PX = rankmod.M_PER_PX
PIXEL_AREA_M2 = M_PER_PX * M_PER_PX

HISTORY_ROOT = v2.HISTORY_ROOT
DEFAULT_SEMANTIC_ROOT = HISTORY_ROOT / "road-semantic-openearthmap"
DEFAULT_V5_ROOT = HISTORY_ROOT / "internal-road-score-v5"
DEFAULT_CANDIDATES = HISTORY_ROOT / "road-within-mother-parcel/road-within-mother-parcel-candidates.csv"
DEFAULT_OUTPUT = HISTORY_ROOT / "observed-parcel-features"
DEFAULT_ASSIGNMENTS = Path("public/data/auditoria/zonificacion-11819-asignaciones.json.gz")
DEFAULT_GEOARBA = rankmod.DEFAULT_GEOARBA


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--semantic-root", type=Path, default=DEFAULT_SEMANTIC_ROOT)
    p.add_argument("--v5-root", type=Path, default=DEFAULT_V5_ROOT)
    p.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    p.add_argument("--assignments", type=Path, default=DEFAULT_ASSIGNMENTS)
    p.add_argument("--registered-dir", type=Path, default=v2.DEFAULT_REGISTERED)
    p.add_argument("--metadata", type=Path, default=v2.DEFAULT_META)
    p.add_argument("--productiva-mask", type=Path, default=v2.DEFAULT_PRODUCTIVA)
    p.add_argument("--geoarba", nargs="+", type=Path, default=DEFAULT_GEOARBA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--road-support-threshold", type=float, default=0.35)
    return p.parse_args()


def read_gray(path: Path) -> np.ndarray:
    arr = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if arr is None:
        raise FileNotFoundError(path)
    return arr


def read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def f(v, default=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return float(default)


def load_productivo_membership(path: Path) -> set[str]:
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        data = json.load(fh)
    vals = data.get("zones", {}).get("productiva", [])
    out: set[str] = set()
    for item in vals:
        if isinstance(item, str):
            out.add(item)
        elif isinstance(item, dict):
            n = item.get("nomenclatura") or item.get("id")
            if n:
                out.add(str(n))
    if not out:
        raise RuntimeError(f"No se pudo resolver zones.productiva en {path}")
    return out


def first_crossing_interval(values: dict[str, float], threshold: float) -> str | None:
    if float(values.get(DATES[0], 0.0)) >= threshold:
        return "pre-2016-11-30"
    for i in range(1, len(DATES)):
        prev = float(values.get(DATES[i - 1], 0.0))
        cur = float(values.get(DATES[i], 0.0))
        if prev < threshold <= cur:
            return f"{DATES[i-1]}→{DATES[i]}"
    return None


def max_positive_delta_interval(values: dict[str, float]) -> tuple[str | None, float]:
    best_interval = None
    best_delta = 0.0
    for i in range(len(DATES) - 1):
        a = float(values.get(DATES[i], 0.0))
        b = float(values.get(DATES[i + 1], 0.0))
        delta = b - a
        if delta > best_delta:
            best_delta = delta
            best_interval = f"{DATES[i]}→{DATES[i+1]}"
    return best_interval, best_delta


def temporal_profile(road_interval: str | None, occupation_interval: str | None) -> str:
    intervals = [f"{DATES[i]}→{DATES[i+1]}" for i in range(len(DATES) - 1)]
    def idx(v):
        if v == "pre-2016-11-30":
            return -1
        try:
            return intervals.index(v) if v else None
        except ValueError:
            return None
    ri, oi = idx(road_interval), idx(occupation_interval)
    if ri is None and oi is None:
        return "no_clear_takeoff"
    if ri is None:
        return "occupation_without_clear_road_crossing"
    if oi is None:
        return "road_without_clear_occupation_takeoff"
    if ri == oi:
        return "coupled_road_and_occupation_transition"
    if ri < oi:
        return "road_first_then_occupation"
    return "occupation_signal_before_road_crossing"


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    membership = load_productivo_membership(args.assignments)
    registered_dir = v2.resolve_registered_dir(args.registered_dir, [DATES[-1]])
    ref = v2.read_image(registered_dir / f"{DATES[-1]}.jpg")
    h, w = ref.shape[:2]
    meta = v2.load_json(args.metadata)
    prod_geo = v2.load_json(args.productiva_mask)
    productivo = v2.rasterize_productivo(meta, prod_geo, (h, w)) > 0

    parcel_labels_all, id_to_props_all, total_read = rankmod.load_parcels(args.geoarba, meta, (h, w))

    # Sólo membresía canónica Productivo; luego clip espacial con máscara Productivo.
    allowed_ids = {
        pid for pid, props in id_to_props_all.items()
        if str(props.get("nomenclatura", "")) in membership
    }
    allowed = np.isin(parcel_labels_all, np.fromiter(allowed_ids, dtype=np.int32)) if allowed_ids else np.zeros((h, w), bool)
    parcel_labels = parcel_labels_all.copy()
    parcel_labels[~allowed] = 0
    parcel_labels[~productivo] = 0

    # Landcover completo por fecha. El mapping runtime validado para este checkpoint es
    # [Bareland, Grass, Pavement, Road, Tree, Water, Cropland, Building].
    ROAD_IDX, PAVEMENT_IDX, BUILDING_IDX = 3, 2, 7
    landcover: dict[str, np.ndarray] = {}
    for d in DATES:
        p = args.semantic_root / d / "landcover-argmax.png"
        landcover[d] = read_gray(p)
        if landcover[d].shape != (h, w):
            raise RuntimeError(f"Shape inesperado en {p}: {landcover[d].shape} != {(h,w)}")

    high = read_gray(args.v5_root / "internal-road-high.png") > 0
    medium = read_gray(args.v5_root / "internal-road-medium.png") > 0
    latest_v5 = (high | medium) & productivo

    candidate_rows = read_csv(args.candidates)
    cand_by_nom: dict[str, list[dict]] = defaultdict(list)
    for r in candidate_rows:
        n = str(r.get("nomenclatura") or "")
        if n in membership:
            cand_by_nom[n].append(r)

    rows: list[dict] = []
    observed_ids = np.unique(parcel_labels)
    observed_ids = observed_ids[observed_ids > 0]

    for pid in observed_ids:
        props = id_to_props_all.get(int(pid), {})
        n = str(props.get("nomenclatura") or "")
        if n not in membership:
            continue
        pmask = parcel_labels == int(pid)
        px = int(pmask.sum())
        if px <= 0:
            continue

        parcel_area_m2 = f(props.get("superficie_m2"))
        observed_area_m2 = px * PIXEL_AREA_M2
        coverage_ratio_proxy = min(observed_area_m2 / parcel_area_m2, 1.0) if parcel_area_m2 > 0 else 0.0
        coverage_status = "observed_cluster02_full" if coverage_ratio_proxy >= 0.95 else "observed_cluster02_partial"

        current_road = latest_v5 & pmask
        current_road_px = int(current_road.sum())
        road_support_by_date: dict[str, float] = {}
        road_fraction_by_date: dict[str, float] = {}
        building_fraction_by_date: dict[str, float] = {}
        pavement_fraction_by_date: dict[str, float] = {}

        for d in DATES:
            lc = landcover[d]
            road = lc == ROAD_IDX
            building = lc == BUILDING_IDX
            pavement = lc == PAVEMENT_IDX
            road_fraction_by_date[d] = float(road[pmask].mean())
            building_fraction_by_date[d] = float(building[pmask].mean())
            pavement_fraction_by_date[d] = float(pavement[pmask].mean())
            road_support_by_date[d] = (
                float(road[current_road].mean()) if current_road_px > 0 else 0.0
            )

        road_interval = first_crossing_interval(road_support_by_date, args.road_support_threshold) if current_road_px > 0 else None
        occupation_interval, occupation_delta = max_positive_delta_interval(building_fraction_by_date)
        pavement_interval, pavement_delta = max_positive_delta_interval(pavement_fraction_by_date)
        profile = temporal_profile(road_interval, occupation_interval)

        cands = cand_by_nom.get(n, [])
        high_c = [r for r in cands if r.get("priority_class") == "high"]
        med_c = [r for r in cands if r.get("priority_class") == "medium"]
        priority_c = high_c + med_c
        total_length_m = sum(f(r.get("approx_length_proxy_m")) for r in priority_c)
        max_depth_m = max([f(r.get("approx_max_depth_m")) for r in priority_c] or [0.0])
        max_priority = max([f(r.get("priority_score")) for r in cands] or [0.0])

        out = {
            "coverage_status": coverage_status,
            "cluster_id": 2,
            "nomenclatura": n,
            "partida": str(props.get("partida") or ""),
            "geoarba_parcel_area_m2": round(parcel_area_m2, 2),
            "observed_productivo_area_m2_proxy": round(observed_area_m2, 2),
            "observed_to_geoarba_area_ratio_proxy": round(coverage_ratio_proxy, 4),
            "observed_pixels": px,
            "v5_high_medium_road_pixels": current_road_px,
            "v5_high_medium_road_fraction_observed": round(current_road_px / px, 6),
            "high_internal_road_segments": len(high_c),
            "medium_internal_road_segments": len(med_c),
            "high_medium_internal_road_length_proxy_m": round(total_length_m, 2),
            "max_internal_road_depth_m": round(max_depth_m, 2),
            "mother_parcel_priority_score": round(max_priority, 4),
            "road_emergence_interval": road_interval or "",
            "occupation_takeoff_interval": occupation_interval or "",
            "occupation_takeoff_delta": round(occupation_delta, 6),
            "pavement_takeoff_interval": pavement_interval or "",
            "pavement_takeoff_delta": round(pavement_delta, 6),
            "temporal_profile": profile,
            "score_status": "no_final_score",
        }
        for d in DATES:
            y = YEAR[d]
            out[f"road_fraction_{y}"] = round(road_fraction_by_date[d], 6)
            out[f"building_fraction_{y}"] = round(building_fraction_by_date[d], 6)
            out[f"pavement_fraction_{y}"] = round(pavement_fraction_by_date[d], 6)
            out[f"road_support_on_2026_v5_footprint_{y}"] = round(road_support_by_date[d], 6)
        rows.append(out)

    rows.sort(key=lambda r: (-f(r.get("mother_parcel_priority_score")), -f(r.get("v5_high_medium_road_fraction_observed")), str(r.get("partida", ""))))

    csv_path = args.output_dir / "cluster02-observed-parcel-features.csv"
    if rows:
        with csv_path.open("w", newline="", encoding="utf-8-sig") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            wr.writeheader()
            wr.writerows(rows)

    full = sum(r["coverage_status"] == "observed_cluster02_full" for r in rows)
    partial = sum(r["coverage_status"] == "observed_cluster02_partial" for r in rows)
    with_v5 = sum(int(r["v5_high_medium_road_pixels"]) > 0 for r in rows)
    with_high = sum(int(r["high_internal_road_segments"]) > 0 for r in rows)
    transformed_occupation = sum(f(r["occupation_takeoff_delta"]) > 0.01 for r in rows)

    report = {
        "scope": "Productivo only within real Cluster 2 coverage",
        "cluster_id": 2,
        "productivo_membership_total": len(membership),
        "geoarba_features_total_read": total_read,
        "observed_productivo_parcels_cluster02": len(rows),
        "observed_full_proxy": full,
        "observed_partial_proxy": partial,
        "parcels_with_v5_high_medium_road": with_v5,
        "parcels_with_high_internal_road_segment": with_high,
        "parcels_with_building_takeoff_delta_gt_0_01": transformed_occupation,
        "coverage_semantics": {
            "observed_cluster02_full": ">=95% proxy de superficie GeoARBA cubierta por píxeles Productivo observados",
            "observed_cluster02_partial": "cobertura Productivo observada menor al 95% proxy; métricas describen sólo la porción observada",
            "not_observed": "parcelas Productivo fuera de cobertura equivalente; no aparecen como filas y nunca deben interpretarse como cero",
        },
        "status": "expanded observed parcel feature table; no final physical_loteo_score",
        "warning": (
            "Las áreas/ratios raster son proxies analíticos y las clases OpenEarthMap son evidencia auxiliar. "
            "No interpretar como porcentaje loteado, superficie vendida, aprobación, incumplimiento ni ilegalidad."
        ),
        "top_by_mother_parcel_priority": rows[:15],
    }
    qa_path = args.output_dir / "cluster02-observed-parcel-features-qa.json"
    qa_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=== CLUSTER 2 OBSERVED PARCEL FEATURES QA ===")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"csv={csv_path}")
    print(f"qa={qa_path}")


if __name__ == "__main__":
    main()
