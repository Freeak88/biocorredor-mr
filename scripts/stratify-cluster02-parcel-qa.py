#!/usr/bin/env python3
"""Estratifica parcelas observadas de Cluster 2 para QA humano balanceado.

No calcula un `physical_loteo_score`. Usa reglas transparentes para separar:
- candidatos convergentes fuertes;
- candidatos intermedios;
- cambios de ocupación sin soporte vial suficiente;
- controles negativos;
- parcelas parciales (fuera de calibración principal).

La finalidad es construir una muestra de validación, no concluir situación legal,
comercial o administrativa.
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

DEFAULT_INPUT = Path(
    "tmp/territorial-analysis/cluster-02-history/observed-parcel-features/"
    "cluster02-observed-parcel-features.csv"
)
DEFAULT_OUTPUT = Path(
    "tmp/territorial-analysis/cluster-02-history/observed-parcel-features/qa-strata"
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--sample-per-stratum", type=int, default=10)
    return p.parse_args()


def f(v, default=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return float(default)


def read_csv(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def classify(r: dict) -> tuple[str, list[str]]:
    cov = r.get("coverage_status", "")
    road_frac = f(r.get("v5_high_medium_road_fraction_observed"))
    high = int(f(r.get("high_internal_road_segments")))
    medium = int(f(r.get("medium_internal_road_segments")))
    priority = f(r.get("mother_parcel_priority_score"))
    occ_delta = f(r.get("occupation_takeoff_delta"))
    pav_delta = f(r.get("pavement_takeoff_delta"))
    building_2026 = f(r.get("building_fraction_2026"))
    road_2026 = f(r.get("road_support_on_2026_v5_footprint_2026"))

    reasons: list[str] = []

    if cov != "observed_cluster02_full":
        return "partial_coverage_review", ["coverage_not_full"]

    # Alta convergencia: corredor interno fuerte + señal vial material + al menos
    # una segunda señal temporal/ocupacional. El threshold de Building no actúa solo.
    if (
        high >= 1
        and road_frac >= 0.02
        and road_2026 >= 0.8
        and (occ_delta >= 0.005 or pav_delta >= 0.02)
    ):
        reasons.extend(["high_internal_road", "material_v5_road"])
        if occ_delta >= 0.005:
            reasons.append("occupation_takeoff_support")
        if pav_delta >= 0.02:
            reasons.append("pavement_takeoff_support")
        return "strong_convergent_candidate", reasons

    # Intermedio: no llega a corredor HIGH, pero hay señal vial relevante y otra
    # evidencia convergente. Sirve para medir recall del ranking fuerte.
    if (
        road_frac >= 0.015
        and road_2026 >= 0.8
        and (medium >= 1 or priority >= 0.5)
        and (occ_delta >= 0.01 or pav_delta >= 0.03)
    ):
        reasons.extend(["v5_road", "secondary_temporal_support"])
        if medium >= 1:
            reasons.append("medium_internal_road")
        if priority >= 0.5:
            reasons.append("mother_parcel_priority")
        return "intermediate_convergent_candidate", reasons

    # Estrato diagnóstico: fuerte cambio semántico de ocupación pero poca calle.
    # Es clave para estimar falsos positivos de OpenEarthMap Building y detectar
    # transformaciones físicas no estructuradas por trama vial.
    if occ_delta >= 0.03 and road_frac < 0.01 and high == 0:
        reasons.extend(["occupation_takeoff_without_material_road", "building_semantic_check"])
        return "occupation_only_review", reasons

    # Controles negativos exigentes: cobertura completa y sin señal relevante.
    if (
        road_frac < 0.002
        and high == 0
        and medium == 0
        and occ_delta < 0.005
        and pav_delta < 0.01
        and building_2026 < 0.01
    ):
        reasons.extend(["minimal_road_signal", "minimal_occupation_change", "minimal_current_building"])
        return "negative_control", reasons

    return "other_observed", ["does_not_meet_primary_strata_rules"]


def sort_key(r: dict) -> tuple:
    # Orden diagnóstico dentro de cada estrato, no score final.
    return (
        -int(f(r.get("high_internal_road_segments"))),
        -f(r.get("mother_parcel_priority_score")),
        -f(r.get("v5_high_medium_road_fraction_observed")),
        -f(r.get("occupation_takeoff_delta")),
        str(r.get("partida", "")),
    )


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    rows = read_csv(args.input)

    strata: dict[str, list[dict]] = {}
    classified: list[dict] = []
    for r in rows:
        stratum, reasons = classify(r)
        out = dict(r)
        out["qa_stratum"] = stratum
        out["qa_stratum_reasons"] = ";".join(reasons)
        classified.append(out)
        strata.setdefault(stratum, []).append(out)

    for vals in strata.values():
        vals.sort(key=sort_key)

    ordered_names = [
        "strong_convergent_candidate",
        "intermediate_convergent_candidate",
        "occupation_only_review",
        "negative_control",
        "other_observed",
        "partial_coverage_review",
    ]

    # Tabla completa clasificada.
    all_csv = args.output_dir / "cluster02-observed-parcel-qa-strata.csv"
    if classified:
        with all_csv.open("w", newline="", encoding="utf-8-sig") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(classified[0].keys()))
            wr.writeheader()
            wr.writerows(classified)

    # Muestra dirigida, balanceada hasta N por estrato principal.
    sample: list[dict] = []
    for name in ordered_names:
        vals = strata.get(name, [])
        if name == "other_observed":
            # Mantener este estrato acotado: sirve como relleno/ambigüedad, no como
            # núcleo de validación.
            take = min(max(3, args.sample_per_stratum // 2), len(vals))
        else:
            take = min(args.sample_per_stratum, len(vals))
        sample.extend(vals[:take])

    sample_csv = args.output_dir / "cluster02-human-qa-sample.csv"
    if sample:
        with sample_csv.open("w", newline="", encoding="utf-8-sig") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(sample[0].keys()))
            wr.writeheader()
            wr.writerows(sample)

    counts = {name: len(strata.get(name, [])) for name in ordered_names}
    report = {
        "scope": "Productivo only within real Cluster 2 coverage",
        "input_rows": len(rows),
        "method": "transparent rule-based QA stratification; not a physical_loteo_score",
        "stratum_counts": counts,
        "sample_per_stratum_target": args.sample_per_stratum,
        "human_qa_sample_rows": len(sample),
        "rules": {
            "strong_convergent_candidate": (
                "full coverage + >=1 HIGH internal-road segment + V5 road fraction >=0.02 + "
                "2026 road support >=0.8 + (occupation delta >=0.005 or pavement delta >=0.02)"
            ),
            "intermediate_convergent_candidate": (
                "full coverage + V5 road fraction >=0.015 + 2026 road support >=0.8 + "
                "(MEDIUM segment or mother priority >=0.5) + "
                "(occupation delta >=0.01 or pavement delta >=0.03)"
            ),
            "occupation_only_review": (
                "full coverage + occupation delta >=0.03 + V5 road fraction <0.01 + no HIGH segment"
            ),
            "negative_control": (
                "full coverage + V5 road fraction <0.002 + no HIGH/MEDIUM segment + "
                "occupation delta <0.005 + pavement delta <0.01 + Building 2026 <0.01"
            ),
            "partial_coverage_review": "coverage not full; excluded from primary calibration",
        },
        "warning": (
            "Estratos para QA humano. No equivalen a loteado/no loteado, venta, aprobación, "
            "incumplimiento, irregularidad ni ilegalidad."
        ),
        "sample_preview": [
            {
                "partida": r.get("partida", ""),
                "nomenclatura": r.get("nomenclatura", ""),
                "qa_stratum": r.get("qa_stratum", ""),
                "reasons": r.get("qa_stratum_reasons", ""),
            }
            for r in sample
        ],
    }
    qa_path = args.output_dir / "cluster02-observed-parcel-qa-strata.json"
    qa_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=== CLUSTER 2 PARCEL QA STRATA ===")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"classified_csv={all_csv}")
    print(f"sample_csv={sample_csv}")
    print(f"qa={qa_path}")


if __name__ == "__main__":
    main()
