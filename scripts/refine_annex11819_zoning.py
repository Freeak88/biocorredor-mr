#!/usr/bin/env python3
"""Refine Ordenanza 11.819/20 Annex I zoning against GeoARBA parcel geometry.

The four source zoning files are deliberately treated as *provisional raster traces*.
This script does not smooth those traces. Instead it uses them only to infer the
zone of each current GeoARBA parcel by polygon-overlap evidence, then snaps strong
assignments to the exact parcel geometry. Parcels close to a zoning boundary remain
explicitly ambiguous and are never silently forced into a category.

Outputs are audit artifacts by default. They are not written over public layers.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any

from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[1]
GEOARBA_DIR = ROOT / "public" / "data" / "geoarba"
AUDIT_DIR = ROOT / "public" / "data" / "auditoria"

QUADRANTS = [
    "ministro-rivadavia-parcels-noroeste.geojson",
    "ministro-rivadavia-parcels-noreste.geojson",
    "ministro-rivadavia-parcels-suroeste.geojson",
    "ministro-rivadavia-parcels-sureste.geojson",
]

ZONES = {
    "productiva": {
        "label": "Zona Productiva",
        "color": "#789766",
        "file": "zonificacion-11819-productiva.geojson",
    },
    "recuperacion": {
        "label": "Zona de Recuperación",
        "color": "#9b6a45",
        "file": "zonificacion-11819-recuperacion.geojson",
    },
    "equipamiento": {
        "label": "Equipamiento",
        "color": "#d4777e",
        "file": "zonificacion-11819-equipamiento.geojson",
    },
    "uso_especifico": {
        "label": "Uso Específico",
        "color": "#73736d",
        "file": "zonificacion-11819-uso-especifico.geojson",
    },
}

# WGS84 GeoJSON -> local metric CRS. Ministro Rivadavia is in UTM zone 21S.
TO_METRIC = Transformer.from_crs("EPSG:4326", "EPSG:32721", always_xy=True).transform


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, value: Any, *, pretty: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(
            value,
            fh,
            ensure_ascii=False,
            separators=None if pretty else (",", ":"),
            indent=2 if pretty else None,
        )
        fh.write("\n")


def feature_key(feature: dict[str, Any], fallback: str) -> str:
    props = feature.get("properties") or {}
    partida = str(props.get("partida") or "")
    nomenclatura = str(props.get("nomenclatura") or "")
    if partida or nomenclatura:
        return f"{partida}|{nomenclatura}"
    return fallback


def load_parcels() -> list[dict[str, Any]]:
    by_key: dict[str, dict[str, Any]] = {}
    for file_name in QUADRANTS:
        data = load_json(GEOARBA_DIR / file_name)
        for idx, feature in enumerate(data.get("features", [])):
            by_key[feature_key(feature, f"{file_name}:{idx}")] = feature
    return list(by_key.values())


def load_zone_geometries() -> dict[str, Any]:
    geometries: dict[str, Any] = {}
    for zone, meta in ZONES.items():
        data = load_json(AUDIT_DIR / meta["file"])
        parts = []
        for feature in data.get("features", []):
            geom = shape(feature["geometry"])
            if not geom.is_valid:
                geom = geom.buffer(0)
            if not geom.is_empty:
                parts.append(geom)
        if not parts:
            raise RuntimeError(f"Zona sin geometría: {zone}")
        merged = unary_union(parts)
        if not merged.is_valid:
            merged = merged.buffer(0)
        geometries[zone] = merged
    return geometries


def metric_area(geom: Any) -> float:
    if geom.is_empty:
        return 0.0
    return float(transform(TO_METRIC, geom).area)


def bbox_disjoint(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool:
    return a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3]


def confidence_label(coverage: float, dominance: float, margin: float) -> str:
    if coverage >= 0.55 and dominance >= 0.90 and margin >= 0.80:
        return "alta"
    if coverage >= 0.30 and dominance >= 0.78 and margin >= 0.55:
        return "media-alta"
    return "media"


def compact_assignment(feature: dict[str, Any], audit: dict[str, Any]) -> dict[str, Any]:
    props = feature.get("properties") or {}
    return {
        "partida": str(props.get("partida") or ""),
        "nomenclatura": str(props.get("nomenclatura") or ""),
        "zone": audit["zone"],
        "confidence": audit["confidence"],
        "coverage": round(audit["coverage"], 4),
        "dominance": round(audit["dominance"], 4),
        "margin": round(audit["margin"], 4),
        "superficie_m2": props.get("superficie_m2"),
    }


def historical_parcel_hint(nomenclatura: str) -> str | None:
    """Return a human-readable tail useful for manual 2020-vs-current review.

    We intentionally do not claim this is a legal historical-parcel parser: the
    current cadastral nomenclature may represent later subdivisions. The tail is
    only a QA hint for comparing current parcels with labels printed on Annex I.
    """
    if not nomenclatura.startswith("00304"):
        return None
    tail = nomenclatura[-8:]
    if any(ch != "0" for ch in tail):
        return tail
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-dir",
        default=str(ROOT / "tmp" / "territorial-audit" / "annex11819-refined"),
    )
    parser.add_argument("--min-coverage", type=float, default=0.12)
    parser.add_argument("--min-dominance", type=float, default=0.72)
    parser.add_argument("--min-margin", type=float, default=0.35)
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    parcels = load_parcels()
    zones = load_zone_geometries()
    zone_bounds = {zone: geom.bounds for zone, geom in zones.items()}
    zoning_envelope = unary_union(list(zones.values())).envelope
    envelope_bounds = zoning_envelope.bounds

    assigned_features: dict[str, list[dict[str, Any]]] = defaultdict(list)
    assignments: list[dict[str, Any]] = []
    ambiguous: list[dict[str, Any]] = []
    candidate_count = 0
    rejected_low_coverage = 0

    zone_area_m2_from_parcels: dict[str, float] = defaultdict(float)
    zone_counts: dict[str, int] = defaultdict(int)

    for idx, feature in enumerate(parcels):
        geom = shape(feature["geometry"])
        if geom.is_empty:
            continue
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty or bbox_disjoint(geom.bounds, envelope_bounds):
            continue

        parcel_area_geom = metric_area(geom)
        if parcel_area_geom <= 0:
            continue

        overlaps: dict[str, float] = {}
        for zone, zone_geom in zones.items():
            if bbox_disjoint(geom.bounds, zone_bounds[zone]):
                overlaps[zone] = 0.0
                continue
            inter = geom.intersection(zone_geom)
            overlaps[zone] = metric_area(inter) if not inter.is_empty else 0.0

        overlap_sum = sum(overlaps.values())
        if overlap_sum <= 0:
            continue
        candidate_count += 1

        coverage = min(1.5, overlap_sum / parcel_area_geom)
        ranked = sorted(overlaps.items(), key=lambda item: item[1], reverse=True)
        best_zone, best_area = ranked[0]
        second_area = ranked[1][1] if len(ranked) > 1 else 0.0
        dominance = best_area / overlap_sum if overlap_sum else 0.0
        margin = (best_area - second_area) / overlap_sum if overlap_sum else 0.0

        props = feature.get("properties") or {}
        base_audit = {
            "partida": str(props.get("partida") or ""),
            "nomenclatura": str(props.get("nomenclatura") or ""),
            "historicalParcelHint": historical_parcel_hint(str(props.get("nomenclatura") or "")),
            "superficie_m2": props.get("superficie_m2"),
            "geometryArea_m2": round(parcel_area_geom, 2),
            "coverage": round(coverage, 6),
            "dominance": round(dominance, 6),
            "margin": round(margin, 6),
            "overlap_m2": {zone: round(value, 2) for zone, value in overlaps.items() if value > 0},
        }

        strong = (
            coverage >= args.min_coverage
            and dominance >= args.min_dominance
            and margin >= args.min_margin
        )

        if not strong:
            if coverage < args.min_coverage:
                rejected_low_coverage += 1
            ambiguous.append(base_audit)
            continue

        confidence = confidence_label(coverage, dominance, margin)
        audit = {
            **base_audit,
            "zone": best_zone,
            "confidence": confidence,
            "method": "geoarba-parcel-snap-from-annex-raster-overlap",
        }
        assignments.append(compact_assignment(feature, audit))

        out_feature = {
            "type": "Feature",
            "properties": {
                **props,
                "zone": best_zone,
                "zone_label": ZONES[best_zone]["label"],
                "zone_color": ZONES[best_zone]["color"],
                "vectorization_method": "geoarba-parcel-snap",
                "vectorization_confidence": confidence,
                "source_coverage": round(coverage, 4),
                "source_dominance": round(dominance, 4),
                "source_margin": round(margin, 4),
            },
            "geometry": mapping(geom),
        }
        assigned_features[best_zone].append(out_feature)
        zone_counts[best_zone] += 1

        official_area = props.get("superficie_m2")
        if isinstance(official_area, (int, float)) and math.isfinite(float(official_area)):
            zone_area_m2_from_parcels[best_zone] += float(official_area)
        else:
            zone_area_m2_from_parcels[best_zone] += parcel_area_geom

    assignments.sort(key=lambda row: (row["zone"], row["nomenclatura"], row["partida"]))
    ambiguous.sort(key=lambda row: (-row["coverage"], row["nomenclatura"], row["partida"]))

    for zone, meta in ZONES.items():
        fc = {
            "type": "FeatureCollection",
            "name": f"Ordenanza 11.819/20 — {meta['label']} — GeoARBA parcel snap",
            "metadata": {
                "status": "refined-candidate",
                "source": "Ordenanza 11.819/20 Anexo I + GeoARBA parcel geometry",
                "method": "dominant polygon overlap followed by exact parcel-boundary snap",
                "minCoverage": args.min_coverage,
                "minDominance": args.min_dominance,
                "minMargin": args.min_margin,
                "warning": "Current GeoARBA may postdate the 2020 Annex. Ambiguous boundary parcels are intentionally excluded pending manual review.",
            },
            "features": assigned_features.get(zone, []),
        }
        write_json(out_dir / f"zonificacion-11819-{zone}-refined.geojson", fc)

    # A compact join table is useful to render the zoning directly from the same
    # GeoARBA geometry already loaded by the public map.
    write_json(out_dir / "parcel-zone-assignments.json", {
        "metadata": {
            "status": "refined-candidate",
            "method": "dominant polygon overlap + parcel snap",
            "thresholds": {
                "minCoverage": args.min_coverage,
                "minDominance": args.min_dominance,
                "minMargin": args.min_margin,
            },
        },
        "assignments": assignments,
    })

    qa = {
        "source": {
            "annex": "Ordenanza 11.819/20 Anexo I, official scan",
            "roughVectors": {zone: meta["file"] for zone, meta in ZONES.items()},
            "parcelGeometry": QUADRANTS,
        },
        "method": {
            "description": "Rough raster-derived zoning is used only as categorical evidence. Strongly dominant overlaps are snapped to the complete current GeoARBA parcel polygon. Ambiguous parcels are withheld for manual review instead of being forced by centroid.",
            "metricCrs": "EPSG:32721",
            "thresholds": {
                "minCoverage": args.min_coverage,
                "minDominance": args.min_dominance,
                "minMargin": args.min_margin,
            },
        },
        "counts": {
            "mosaicParcels": len(parcels),
            "candidateParcelsTouchedBySource": candidate_count,
            "assignedParcels": len(assignments),
            "ambiguousParcels": len(ambiguous),
            "rejectedLowCoverage": rejected_low_coverage,
        },
        "zones": [
            {
                "zone": zone,
                "label": ZONES[zone]["label"],
                "parcelCount": zone_counts.get(zone, 0),
                "areaHaFromGeoARBA": round(zone_area_m2_from_parcels.get(zone, 0.0) / 10000.0, 3),
            }
            for zone in ZONES
        ],
        "ambiguous": ambiguous,
        "cautions": [
            "A parcel snap improves boundary precision but does not by itself prove that the current parcel geometry is identical to the 2020 cadastral state.",
            "Any parcel with mixed-zone evidence remains in the ambiguity table and needs visual review against the official Annex I.",
            "Legal quota accounting still requires the historical denominator and municipal project-by-project imputations.",
        ],
    }
    write_json(out_dir / "qa-report.json", qa, pretty=True)

    print("ANNEX_11819_REFINED_BEGIN")
    print(json.dumps({
        "outputDir": str(out_dir),
        "counts": qa["counts"],
        "zones": qa["zones"],
        "ambiguousTop20": ambiguous[:20],
    }, ensure_ascii=False, indent=2))
    print("ANNEX_11819_REFINED_END")


if __name__ == "__main__":
    main()
