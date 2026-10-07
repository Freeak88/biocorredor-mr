#!/usr/bin/env python3
"""Clasifica cronología física auxiliar de parcelas madre candidatas.

Lee `mother-parcel-temporal-landcover-qa.json` y deriva dos hitos separados:
- `road_emergence_interval`: primer intervalo en que el soporte vial sobre el
  footprint V5 2026 cruza el umbral operativo;
- `occupation_takeoff_interval`: intervalo con mayor incremento positivo de
  `Building` semántico OpenEarthMap.

La salida NO determina fecha de loteo, aprobación, subdivisión, venta,
irregularidad ni ilegalidad. Es una cronología física auxiliar para priorización.
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

DATES = ["2016-11-30", "2020-03-03", "2022-03-01", "2023-04-19", "2026-01-11"]
INTERVALS = [f"{DATES[i]}→{DATES[i+1]}" for i in range(len(DATES) - 1)]

DEFAULT_INPUT = Path(
    "tmp/territorial-analysis/cluster-02-history/road-within-mother-parcel/"
    "temporal-landcover/mother-parcel-temporal-landcover-qa.json"
)
DEFAULT_OUTPUT = Path(
    "tmp/territorial-analysis/cluster-02-history/road-within-mother-parcel/"
    "transformation-phase"
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    return p.parse_args()


def first_crossing_interval(values: dict[str, float], threshold: float) -> str | None:
    # Si ya supera en 2016, sólo sabemos que es preexistente a la primera fecha.
    if float(values.get(DATES[0], 0.0)) >= threshold:
        return "pre-2016-11-30"
    for i in range(1, len(DATES)):
        prev = float(values.get(DATES[i - 1], 0.0))
        cur = float(values.get(DATES[i], 0.0))
        if prev < threshold <= cur:
            return INTERVALS[i - 1]
    return None


def max_positive_delta_interval(values: dict[str, float]) -> tuple[str | None, float]:
    best_interval = None
    best_delta = 0.0
    for i, interval in enumerate(INTERVALS):
        a = float(values.get(DATES[i], 0.0))
        b = float(values.get(DATES[i + 1], 0.0))
        delta = b - a
        if delta > best_delta:
            best_delta = delta
            best_interval = interval
    return best_interval, best_delta


def index_of_interval(interval: str | None) -> int | None:
    if interval is None:
        return None
    if interval == "pre-2016-11-30":
        return -1
    try:
        return INTERVALS.index(interval)
    except ValueError:
        return None


def temporal_profile(road_interval: str | None, occupation_interval: str | None) -> str:
    ri = index_of_interval(road_interval)
    oi = index_of_interval(occupation_interval)
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
    data = json.loads(args.input.read_text(encoding="utf-8"))
    threshold = float(data.get("road_support_threshold", 0.35))

    rows: list[dict] = []
    reports: list[dict] = []
    for p in data.get("parcels", []):
        road_support = {str(k): float(v) for k, v in p.get("road_support_on_2026_v5_footprint", {}).items()}
        building = {str(k): float(v) for k, v in p.get("building_fraction", {}).items()}
        pavement = {str(k): float(v) for k, v in p.get("pavement_fraction", {}).items()}

        road_interval = first_crossing_interval(road_support, threshold)
        occupation_interval, occupation_delta = max_positive_delta_interval(building)
        pavement_interval, pavement_delta = max_positive_delta_interval(pavement)
        profile = temporal_profile(road_interval, occupation_interval)

        item = {
            "rank": p.get("rank"),
            "nomenclatura": p.get("nomenclatura", ""),
            "partida": p.get("partida", ""),
            "parcel_area_m2": p.get("parcel_area_m2", ""),
            "priority_score": p.get("priority_score", ""),
            "road_support_threshold": threshold,
            "road_emergence_interval": road_interval,
            "occupation_takeoff_interval": occupation_interval,
            "occupation_takeoff_delta": round(occupation_delta, 6),
            "pavement_takeoff_interval": pavement_interval,
            "pavement_takeoff_delta": round(pavement_delta, 6),
            "temporal_profile": profile,
            "building_fraction_2026": float(building.get("2026-01-11", 0.0)),
            "road_support_2026": float(road_support.get("2026-01-11", 0.0)),
        }
        rows.append(item)
        reports.append(item)

    csv_path = args.output_dir / "mother-parcel-transformation-phase.csv"
    if rows:
        with csv_path.open("w", newline="", encoding="utf-8-sig") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            wr.writeheader()
            wr.writerows(rows)

    report = {
        "scope": data.get("scope", "Productivo only within Cluster 2 coverage"),
        "method": "road threshold crossing + maximum positive Building delta; Pavement delta as auxiliary support",
        "road_support_threshold": threshold,
        "status": "diagnostic physical chronology; human/visual QA remains authoritative",
        "warning": (
            "Los intervalos son hitos de evidencia física auxiliar. No equivalen a fecha de loteo, "
            "aprobación, subdivisión, venta, irregularidad ni ilegalidad."
        ),
        "parcels": reports,
    }
    qa_path = args.output_dir / "mother-parcel-transformation-phase-qa.json"
    qa_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=== MOTHER PARCEL TRANSFORMATION PHASE QA ===")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"csv={csv_path}")
    print(f"qa={qa_path}")


if __name__ == "__main__":
    main()
