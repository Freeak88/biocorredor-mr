#!/usr/bin/env python3
"""V6 de estratificación parcelaria para QA humano en Cluster 2.

Refina la V1 de estratos incorporando señales espaciales que surgieron del QA visual:
- penalización por footprint vial pegado al borde parcelario;
- bonus/gate por penetración y red interna real;
- proxy de cobertura productiva por Cropland + componentes Building elongados.

No calcula un `physical_loteo_score` final. Sigue siendo una herramienta diagnóstica
para calibración humana dentro del universo Productivo realmente observado.
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
import json
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

HISTORY_ROOT = v2.HISTORY_ROOT
DEFAULT_INPUT = HISTORY_ROOT / "observed-parcel-features/cluster02-observed-parcel-features.csv"
DEFAULT_V5_ROOT = HISTORY_ROOT / "internal-road-score-v5"
DEFAULT_SEMANTIC = HISTORY_ROOT / "road-semantic-openearthmap/2026-01-11/landcover-argmax.png"
DEFAULT_OUTPUT = HISTORY_ROOT / "observed-parcel-features/qa-strata-v6"
DEFAULT_GEOARBA = rankmod.DEFAULT_GEOARBA

ROAD_IDX = 3
CROPLAND_IDX = 6
BUILDING_IDX = 7


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    p.add_argument("--v5-root", type=Path, default=DEFAULT_V5_ROOT)
    p.add_argument("--semantic", type=Path, default=DEFAULT_SEMANTIC)
    p.add_argument("--registered-dir", type=Path, default=v2.DEFAULT_REGISTERED)
    p.add_argument("--metadata", type=Path, default=v2.DEFAULT_META)
    p.add_argument("--geoarba", nargs="+", type=Path, default=DEFAULT_GEOARBA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--edge-radius-px", type=int, default=12)
    p.add_argument("--interior-radius-px", type=int, default=16)
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


def read_gray(path: Path) -> np.ndarray:
    arr = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if arr is None:
        raise FileNotFoundError(path)
    return arr


def skeletonize(mask: np.ndarray) -> np.ndarray:
    img = (mask.astype(np.uint8) * 255)
    skel = np.zeros_like(img)
    element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
    while cv2.countNonZero(img) > 0:
        eroded = cv2.erode(img, element)
        opened = cv2.dilate(eroded, element)
        temp = cv2.subtract(img, opened)
        skel = cv2.bitwise_or(skel, temp)
        img = eroded
    return skel > 0


def elongated_building_proxy(building_mask: np.ndarray, parcel_px: int) -> tuple[float, float, int]:
    if parcel_px <= 0 or not np.any(building_mask):
        return 0.0, 0.0, 0
    n, cc, stats, _ = cv2.connectedComponentsWithStats(building_mask.astype(np.uint8), 8)
    elongated_px = 0
    elongated_components = 0
    building_px = int(building_mask.sum())
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < 20:
            continue
        w = int(stats[i, cv2.CC_STAT_WIDTH])
        h = int(stats[i, cv2.CC_STAT_HEIGHT])
        aspect = max(w, h) / max(min(w, h), 1)
        if aspect >= 3.0:
            elongated_px += area
            elongated_components += 1
    frac_parcel = elongated_px / parcel_px
    frac_building = elongated_px / building_px if building_px > 0 else 0.0
    return float(frac_parcel), float(frac_building), elongated_components


def spatial_metrics(pmask: np.ndarray, road_mask: np.ndarray, landcover: np.ndarray, args: argparse.Namespace) -> dict:
    ys, xs = np.where(pmask)
    if len(xs) == 0:
        return {}
    pad = max(args.interior_radius_px, args.edge_radius_px) + 4
    x0, x1 = max(int(xs.min()) - pad, 0), min(int(xs.max()) + pad + 1, pmask.shape[1])
    y0, y1 = max(int(ys.min()) - pad, 0), min(int(ys.max()) + pad + 1, pmask.shape[0])
    p = pmask[y0:y1, x0:x1]
    r = road_mask[y0:y1, x0:x1] & p
    lc = landcover[y0:y1, x0:x1]
    parcel_px = int(p.sum())
    road_px = int(r.sum())

    dist = cv2.distanceTransform(p.astype(np.uint8), cv2.DIST_L2, 5)
    edge_zone = dist <= float(args.edge_radius_px)
    deep_zone = dist >= float(args.interior_radius_px)

    if road_px > 0:
        edge_frac = float(edge_zone[r].mean())
        deep_frac = float(deep_zone[r].mean())
    else:
        edge_frac = 0.0
        deep_frac = 0.0

    deep_road = r & deep_zone
    n, _, stats, _ = cv2.connectedComponentsWithStats(deep_road.astype(np.uint8), 8)
    deep_components = sum(int(stats[i, cv2.CC_STAT_AREA]) >= 12 for i in range(1, n))

    skel = skeletonize(r) if road_px > 0 else np.zeros_like(r, dtype=bool)
    skel_px = int(skel.sum())
    skel_deep_px = int((skel & deep_zone).sum())
    if skel_px > 0:
        neigh = cv2.filter2D(skel.astype(np.uint8), cv2.CV_16S, np.ones((3, 3), np.uint8), borderType=cv2.BORDER_CONSTANT)
        neigh = neigh - skel.astype(np.int16)
        branch = skel & (neigh >= 3)
        bn, _, bstats, _ = cv2.connectedComponentsWithStats(branch.astype(np.uint8), 8)
        junctions = sum(int(bstats[i, cv2.CC_STAT_AREA]) >= 1 for i in range(1, bn))
    else:
        junctions = 0

    building = (lc == BUILDING_IDX) & p
    cropland = (lc == CROPLAND_IDX) & p
    elong_parcel, elong_of_building, elong_n = elongated_building_proxy(building, parcel_px)
    cropland_frac = float(cropland.sum() / parcel_px) if parcel_px else 0.0

    deep_len_norm = min((skel_deep_px * rankmod.M_PER_PX) / 100.0, 1.0)
    network_score = (
        0.45 * deep_frac
        + 0.25 * deep_len_norm
        + 0.20 * min(junctions / 3.0, 1.0)
        + 0.10 * min(deep_components / 2.0, 1.0)
    )
    edge_penalty = max((edge_frac - 0.50) / 0.50, 0.0)
    productive_cover_proxy = min(1.0, 0.45 * min(cropland_frac / 0.40, 1.0) + 0.55 * min(elong_of_building / 0.65, 1.0))

    return {
        "edge_road_fraction": round(edge_frac, 6),
        "deep_road_fraction": round(deep_frac, 6),
        "deep_road_components": int(deep_components),
        "road_skeleton_length_proxy_m": round(skel_px * rankmod.M_PER_PX, 2),
        "deep_road_skeleton_length_proxy_m": round(skel_deep_px * rankmod.M_PER_PX, 2),
        "road_junction_proxy_count": int(junctions),
        "interior_network_score_v6": round(float(network_score), 6),
        "edge_penalty_v6": round(float(edge_penalty), 6),
        "cropland_fraction_2026_v6": round(cropland_frac, 6),
        "elongated_building_fraction_parcel_v6": round(elong_parcel, 6),
        "elongated_building_fraction_of_building_v6": round(elong_of_building, 6),
        "elongated_building_components_v6": int(elong_n),
        "productive_cover_proxy_v6": round(float(productive_cover_proxy), 6),
    }


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
    edge = f(r.get("edge_road_fraction"))
    deep = f(r.get("deep_road_fraction"))
    network = f(r.get("interior_network_score_v6"))
    productive = f(r.get("productive_cover_proxy_v6"))

    reasons: list[str] = []
    if cov != "observed_cluster02_full":
        return "partial_coverage_review", ["coverage_not_full"]

    # Strong: preserva el criterio convergente, pero exige que la calle sea realmente
    # interior o que la red interna tenga score suficiente. Evita promover bordes.
    if (
        high >= 1
        and road_frac >= 0.02
        and road_2026 >= 0.8
        and (occ_delta >= 0.005 or pav_delta >= 0.02)
        and (deep >= 0.30 or network >= 0.38)
        and edge <= 0.72
    ):
        reasons += ["high_internal_road", "material_v5_road", "interior_network_guard_pass"]
        if occ_delta >= 0.005:
            reasons.append("occupation_takeoff_support")
        if pav_delta >= 0.02:
            reasons.append("pavement_takeoff_support")
        return "strong_convergent_candidate", reasons

    # Intermedio V6: acá estaba el mayor problema de precisión. Ahora requiere
    # penetración/red interna y rechaza borde dominante + patrón productivo fuerte.
    if (
        road_frac >= 0.015
        and road_2026 >= 0.8
        and (medium >= 1 or priority >= 0.5 or network >= 0.34)
        and (occ_delta >= 0.01 or pav_delta >= 0.03)
        and deep >= 0.22
        and network >= 0.30
        and edge <= 0.62
        and productive < 0.58
    ):
        reasons += ["v5_road", "secondary_temporal_support", "interior_network_guard_pass"]
        if productive >= 0.35:
            reasons.append("moderate_productive_cover")
        return "intermediate_convergent_candidate", reasons

    if occ_delta >= 0.03 and road_frac < 0.01 and high == 0:
        return "occupation_only_review", ["occupation_takeoff_without_material_road", "building_semantic_check"]

    if (
        road_frac < 0.002
        and high == 0
        and medium == 0
        and occ_delta < 0.005
        and pav_delta < 0.01
        and building_2026 < 0.01
    ):
        return "negative_control", ["minimal_road_signal", "minimal_occupation_change", "minimal_current_building"]

    if edge > 0.70 and network < 0.25:
        return "edge_access_or_perimeter_review", ["edge_dominated_road", "weak_internal_network"]

    if productive >= 0.58 and network < 0.35:
        return "productive_pattern_review", ["productive_cover_proxy", "weak_internal_network"]

    return "other_observed", ["does_not_meet_v6_primary_rules"]


def sort_key(r: dict) -> tuple:
    return (
        -int(f(r.get("high_internal_road_segments"))),
        -f(r.get("interior_network_score_v6")),
        -f(r.get("mother_parcel_priority_score")),
        -f(r.get("v5_high_medium_road_fraction_observed")),
        str(r.get("partida", "")),
    )


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    rows = read_csv(args.input)

    registered_dir = v2.resolve_registered_dir(args.registered_dir, ["2026-01-11"])
    ref = v2.read_image(registered_dir / "2026-01-11.jpg")
    h, w = ref.shape[:2]
    meta = v2.load_json(args.metadata)
    parcel_labels, props_by_id, _ = rankmod.load_parcels(args.geoarba, meta, (h, w))
    high_mask = read_gray(args.v5_root / "internal-road-high.png") > 0
    med_mask = read_gray(args.v5_root / "internal-road-medium.png") > 0
    road_mask = high_mask | med_mask
    landcover = read_gray(args.semantic)

    nom_to_id = {str(p.get("nomenclatura") or ""): pid for pid, p in props_by_id.items()}

    enriched: list[dict] = []
    strata: dict[str, list[dict]] = {}
    for r in rows:
        out = dict(r)
        n = str(r.get("nomenclatura") or "")
        pid = nom_to_id.get(n)
        if pid is not None:
            pmask = parcel_labels == int(pid)
            out.update(spatial_metrics(pmask, road_mask, landcover, args))
        else:
            out.update({
                "edge_road_fraction": 0.0,
                "deep_road_fraction": 0.0,
                "deep_road_components": 0,
                "road_skeleton_length_proxy_m": 0.0,
                "deep_road_skeleton_length_proxy_m": 0.0,
                "road_junction_proxy_count": 0,
                "interior_network_score_v6": 0.0,
                "edge_penalty_v6": 0.0,
                "cropland_fraction_2026_v6": 0.0,
                "elongated_building_fraction_parcel_v6": 0.0,
                "elongated_building_fraction_of_building_v6": 0.0,
                "elongated_building_components_v6": 0,
                "productive_cover_proxy_v6": 0.0,
            })
        stratum, reasons = classify(out)
        out["qa_stratum_v6"] = stratum
        out["qa_stratum_v6_reasons"] = ";".join(reasons)
        enriched.append(out)
        strata.setdefault(stratum, []).append(out)

    for vals in strata.values():
        vals.sort(key=sort_key)

    ordered = [
        "strong_convergent_candidate",
        "intermediate_convergent_candidate",
        "edge_access_or_perimeter_review",
        "productive_pattern_review",
        "occupation_only_review",
        "negative_control",
        "other_observed",
        "partial_coverage_review",
    ]

    all_csv = args.output_dir / "cluster02-observed-parcel-qa-strata-v6.csv"
    if enriched:
        with all_csv.open("w", newline="", encoding="utf-8-sig") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(enriched[0].keys()))
            wr.writeheader(); wr.writerows(enriched)

    sample: list[dict] = []
    for name in ordered:
        vals = strata.get(name, [])
        if name == "other_observed":
            take = min(max(3, args.sample_per_stratum // 2), len(vals))
        else:
            take = min(args.sample_per_stratum, len(vals))
        sample.extend(vals[:take])

    sample_csv = args.output_dir / "cluster02-human-qa-sample-v6.csv"
    if sample:
        with sample_csv.open("w", newline="", encoding="utf-8-sig") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(sample[0].keys()))
            wr.writeheader(); wr.writerows(sample)

    counts = {name: len(strata.get(name, [])) for name in ordered}
    report = {
        "scope": "Productivo only within real Cluster 2 coverage",
        "input_rows": len(rows),
        "method": "V6 transparent QA stratification with parcel-edge, interior-network and productive-cover guards",
        "edge_radius_px": args.edge_radius_px,
        "interior_radius_px": args.interior_radius_px,
        "stratum_counts": counts,
        "human_qa_sample_rows": len(sample),
        "v6_rules": {
            "strong": "V1 convergence + interior/deep road guard + edge_fraction<=0.72",
            "intermediate": "V1-like convergence + deep>=0.22 + network>=0.30 + edge<=0.62 + productive<0.58",
            "edge_access_or_perimeter_review": "edge>0.70 and network<0.25",
            "productive_pattern_review": "productive>=0.58 and network<0.35",
        },
        "warning": "Estratos para QA humano. No equivalen a loteado/no loteado, venta, aprobación, incumplimiento, irregularidad ni ilegalidad.",
    }
    qa_path = args.output_dir / "cluster02-observed-parcel-qa-strata-v6.json"
    qa_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=== CLUSTER 2 PARCEL QA STRATA V6 ===")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"classified_csv={all_csv}")
    print(f"sample_csv={sample_csv}")
    print(f"qa={qa_path}")


if __name__ == "__main__":
    main()
