#!/usr/bin/env python3
"""Construye una tabla parcelaria piloto para Cluster 2.

Scope duro: Productivo únicamente y sólo parcelas efectivamente observadas en el
pipeline VHR de Cluster 2. No asigna cero a parcelas del universo Productivo que
aún no tienen cobertura analítica equivalente.

Integra:
- cronología física (`mother-parcel-transformation-phase.csv`);
- series multi-clase OpenEarthMap (`mother-parcel-temporal-landcover.csv`);
- ranking de corredor vial dentro de parcela madre
  (`road-within-mother-parcel-candidates.csv`).

La salida es un schema piloto de features físicas, no un score legal/comercial.
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path

DATES = ["2016-11-30", "2020-03-03", "2022-03-01", "2023-04-19", "2026-01-11"]
ROOT = Path("tmp/territorial-analysis/cluster-02-history/road-within-mother-parcel")
DEFAULT_PHASE = ROOT / "transformation-phase/mother-parcel-transformation-phase.csv"
DEFAULT_LANDCOVER = ROOT / "temporal-landcover/mother-parcel-temporal-landcover.csv"
DEFAULT_CANDIDATES = ROOT / "road-within-mother-parcel-candidates.csv"
DEFAULT_OUTPUT = ROOT / "parcel-pilot-features"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--phase", type=Path, default=DEFAULT_PHASE)
    p.add_argument("--landcover", type=Path, default=DEFAULT_LANDCOVER)
    p.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    return p.parse_args()


def read_csv(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def f(v, default=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return float(default)


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    phase_rows = read_csv(args.phase)
    lc_rows = read_csv(args.landcover)
    candidate_rows = read_csv(args.candidates)

    phase_by_nom = {r["nomenclatura"]: r for r in phase_rows if r.get("nomenclatura")}

    lc_by_nom: dict[str, dict[str, dict]] = defaultdict(dict)
    for r in lc_rows:
        n = r.get("nomenclatura", "")
        d = r.get("date", "")
        if n and d:
            lc_by_nom[n][d] = r

    cand_by_nom: dict[str, list[dict]] = defaultdict(list)
    for r in candidate_rows:
        n = r.get("nomenclatura", "")
        if n:
            cand_by_nom[n].append(r)

    rows: list[dict] = []
    for n, p in phase_by_nom.items():
        lc = lc_by_nom.get(n, {})
        cands = cand_by_nom.get(n, [])
        high = [r for r in cands if r.get("priority_class") == "high"]
        medium = [r for r in cands if r.get("priority_class") == "medium"]
        all_priority = high + medium

        max_priority = max([f(r.get("priority_score")) for r in cands] or [0.0])
        total_length_m = sum(f(r.get("approx_length_proxy_m")) for r in all_priority)
        max_depth_m = max([f(r.get("approx_max_depth_m")) for r in all_priority] or [0.0])
        mean_deep_fraction = (
            sum(f(r.get("deep_inside_fraction")) for r in all_priority) / len(all_priority)
            if all_priority else 0.0
        )
        mean_recent_fraction = (
            sum(f(r.get("recent_2022plus_fraction")) for r in all_priority) / len(all_priority)
            if all_priority else 0.0
        )

        out = {
            "coverage_status": "observed_cluster02",
            "cluster_id": 2,
            "nomenclatura": n,
            "partida": p.get("partida", ""),
            "parcel_area_m2": round(f(p.get("parcel_area_m2")), 2),
            "mother_parcel_priority_score": round(max_priority, 4),
            "high_internal_road_segments": len(high),
            "medium_internal_road_segments": len(medium),
            "high_medium_internal_road_length_proxy_m": round(total_length_m, 2),
            "max_internal_road_depth_m": round(max_depth_m, 2),
            "mean_deep_inside_fraction": round(mean_deep_fraction, 4),
            "mean_recent_2022plus_fraction": round(mean_recent_fraction, 4),
            "road_emergence_interval": p.get("road_emergence_interval", ""),
            "occupation_takeoff_interval": p.get("occupation_takeoff_interval", ""),
            "occupation_takeoff_delta": round(f(p.get("occupation_takeoff_delta")), 6),
            "pavement_takeoff_interval": p.get("pavement_takeoff_interval", ""),
            "pavement_takeoff_delta": round(f(p.get("pavement_takeoff_delta")), 6),
            "temporal_profile": p.get("temporal_profile", ""),
            "road_support_2026": round(f(p.get("road_support_2026")), 6),
            "building_fraction_2026": round(f(p.get("building_fraction_2026")), 6),
        }

        for d in DATES:
            r = lc.get(d, {})
            suffix = d[:4]
            out[f"road_fraction_{suffix}"] = round(f(r.get("road_fraction")), 6)
            out[f"building_fraction_{suffix}"] = round(f(r.get("building_fraction")), 6)
            out[f"pavement_fraction_{suffix}"] = round(f(r.get("pavement_fraction")), 6)
            out[f"road_support_on_2026_footprint_{suffix}"] = round(
                f(r.get("road_support_on_2026_v5_footprint")), 6
            )

        # Evidencia física auxiliar: prioriza convergencia temporal y fuerza vial,
        # sin convertirlo en `physical_loteo_score` definitivo.
        chronology_support = min(
            1.0,
            5.0 * f(p.get("occupation_takeoff_delta"))
            + 3.0 * f(p.get("pavement_takeoff_delta")),
        )
        current_occupation = min(1.0, 5.0 * f(p.get("building_fraction_2026")))
        pilot_evidence = (
            0.40 * max_priority
            + 0.25 * chronology_support
            + 0.20 * current_occupation
            + 0.15 * min(1.0, total_length_m / 500.0)
        )
        out["physical_transformation_evidence_score_pilot"] = round(pilot_evidence, 4)
        out["score_status"] = "pilot_not_calibrated"
        rows.append(out)

    rows.sort(
        key=lambda r: (
            -f(r.get("physical_transformation_evidence_score_pilot")),
            -f(r.get("mother_parcel_priority_score")),
        )
    )

    csv_path = args.output_dir / "cluster02-parcel-pilot-features.csv"
    if rows:
        with csv_path.open("w", newline="", encoding="utf-8-sig") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            wr.writeheader()
            wr.writerows(rows)

    report = {
        "scope": "Productivo only within real Cluster 2 coverage",
        "cluster_id": 2,
        "observed_parcels_in_pilot": len(rows),
        "coverage_semantics": {
            "observed_cluster02": "parcela con evidencia VHR procesada en Cluster 2",
            "not_observed": "reservado para parcelas Productivo sin cobertura equivalente; nunca interpretar como cero",
        },
        "status": "pilot parcel feature schema; not a final physical_loteo_score",
        "warning": (
            "physical_transformation_evidence_score_pilot es sólo un ranking diagnóstico interno. "
            "No equivale a porcentaje loteado, venta, aprobación, incumplimiento ni ilegalidad."
        ),
        "rows": rows,
    }
    qa_path = args.output_dir / "cluster02-parcel-pilot-features-qa.json"
    qa_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=== CLUSTER 2 PARCEL PILOT FEATURES QA ===")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"csv={csv_path}")
    print(f"qa={qa_path}")


if __name__ == "__main__":
    main()
