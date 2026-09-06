#!/usr/bin/env python3
"""Validate the finalized Annex I vectorization against current GeoARBA parcels.

The public zoning files are compact dissolved web geometries. The authoritative
audit assignment is the nomenclatura index in zonificacion-11819-asignaciones.json.
CI reconstructs the exact parcel unions from the committed GeoARBA quadrants and
checks that the web geometry remains spatially equivalent (<0.1 m Hausdorff).
"""

from __future__ import annotations

import gzip
import json
import math
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform, unary_union
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "public" / "data" / "auditoria"
GEOARBA = ROOT / "public" / "data" / "geoarba"

QUADRANTS = [
    "ministro-rivadavia-parcels-noroeste.geojson",
    "ministro-rivadavia-parcels-noreste.geojson",
    "ministro-rivadavia-parcels-suroeste.geojson",
    "ministro-rivadavia-parcels-sureste.geojson",
]
ZONES = {
    "productiva": ("zonificacion-11819-productiva.geojson.gz", 520, 1303.584699),
    "recuperacion": ("zonificacion-11819-recuperacion.geojson.gz", 205, 1201.263548),
    "equipamiento": ("zonificacion-11819-equipamiento.geojson.gz", 8, 45.869887),
    "uso_especifico": ("zonificacion-11819-uso-especifico.geojson", 10, 83.229336),
}
SH_SPECIFIC = {769, 770, 771, 772, 773, 774, 775}
SH_RECOVERY = {776, 777}
TO_METRIC = Transformer.from_crs("EPSG:4326", "EPSG:32721", always_xy=True).transform


def load(path: Path):
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            return json.load(fh)
    return json.loads(path.read_text(encoding="utf-8"))


def feature_key(feature, fallback):
    p = feature.get("properties") or {}
    nom = str(p.get("nomenclatura") or "")
    partida = str(p.get("partida") or "")
    return nom or partida or fallback


def historical_number(nom: str):
    if not nom.startswith("00304") or not nom.endswith("000"):
        return None
    tail = nom[-6:-3]
    return int(tail) if tail.isdigit() else None


def main():
    index = load(AUDIT / "zonificacion-11819-asignaciones.json.gz")
    assert index["metadata"]["status"] == "final-reconstruction"

    by_nom = {}
    for file_name in QUADRANTS:
        data = load(GEOARBA / file_name)
        for i, f in enumerate(data.get("features", [])):
            by_nom[feature_key(f, f"{file_name}:{i}")] = f

    all_assigned = set()
    zone_exact = {}
    zone_urban = {}
    by_number = {}

    for zone, (display_name, expected_count, expected_area) in ZONES.items():
        noms = index["zones"][zone]
        assert len(noms) == expected_count, (zone, len(noms), expected_count)
        assert len(noms) == len(set(noms))
        assert not (all_assigned & set(noms)), f"cross-zone duplicate in {zone}"
        all_assigned.update(noms)

        missing = [n for n in noms if n not in by_nom]
        assert not missing, (zone, "missing GeoARBA", missing[:10])

        features = [by_nom[n] for n in noms]
        area = sum(float((f.get("properties") or {}).get("superficie_m2") or 0.0) for f in features) / 10000.0
        assert math.isclose(area, expected_area, abs_tol=1e-6), (zone, area, expected_area)

        urban = [f for f in features if str((f.get("properties") or {}).get("tipo") or "").lower() == "urbano"]
        urban_area = sum(float((f.get("properties") or {}).get("superficie_m2") or 0.0) for f in urban) / 10000.0
        zone_urban[zone] = (len(urban), urban_area)

        geoms = []
        for f in features:
            g = shape(f["geometry"])
            if not g.is_valid:
                g = make_valid(g)
            geoms.append(g)
            n = historical_number(str((f.get("properties") or {}).get("nomenclatura") or ""))
            if n is not None:
                by_number.setdefault(n, set()).add(zone)
        exact = unary_union(geoms)
        if not exact.is_valid:
            exact = make_valid(exact)
        zone_exact[zone] = exact

        display = load(AUDIT / display_name)
        assert display["metadata"]["status"] == "final-reconstruction"
        assert display["metadata"]["parcelCount"] == expected_count
        assert math.isclose(float(display["metadata"]["areaHa"]), expected_area, abs_tol=1e-6)
        assert len(display["features"]) == 1
        web = shape(display["features"][0]["geometry"])
        if not web.is_valid:
            web = make_valid(web)

        exact_m = transform(TO_METRIC, exact)
        web_m = transform(TO_METRIC, web)
        hausdorff = exact_m.hausdorff_distance(web_m)
        symdiff = exact_m.symmetric_difference(web_m).area
        ratio = symdiff / exact_m.area
        assert hausdorff <= 0.10, (zone, "hausdorff_m", hausdorff)
        assert ratio <= 0.00030, (zone, "symdiff_ratio", ratio)

    assert len(all_assigned) == 743
    assert math.isclose(sum(v[2] for v in ZONES.values()), 2633.94747, abs_tol=1e-6)

    unresolved = index["unresolved"]
    assert len(unresolved) == 16
    assert not (set(unresolved) & all_assigned)
    missing_unresolved = [n for n in unresolved if n not in by_nom]
    assert not missing_unresolved
    unresolved_area = sum(
        float((by_nom[n].get("properties") or {}).get("superficie_m2") or 0.0)
        for n in unresolved
    ) / 10000.0
    assert math.isclose(unresolved_area, 4.856971, abs_tol=1e-6)

    for n in SH_SPECIFIC:
        assert by_number.get(n) == {"uso_especifico"}, (n, by_number.get(n))
    for n in SH_RECOVERY:
        assert by_number.get(n) == {"recuperacion"}, (n, by_number.get(n))

    assert zone_urban["productiva"][0] == 184
    assert math.isclose(zone_urban["productiva"][1], 122.534554, abs_tol=1e-6)
    exception_urban = sum(zone_urban[z][1] for z in ("recuperacion", "equipamiento", "uso_especifico"))
    assert math.isclose(exception_urban, 98.211735, abs_tol=1e-6)

    qa = load(AUDIT / "zonificacion-11819-qa.json")
    assert qa["validation"]["uniqueAssignments"] is True
    assert math.isclose(qa["quotaSpatialProxy"]["ordinary10MinHa"], 130.358, abs_tol=0.001)
    assert math.isclose(qa["quotaSpatialProxy"]["ordinary10MaxHa"], 130.844, abs_tol=0.001)
    assert math.isclose(qa["quotaSpatialProxy"]["productiveUrbanScreeningHa"], 122.534554, abs_tol=1e-6)
    assert math.isclose(qa["quotaSpatialProxy"]["gapToOrdinary10MinHa"], 7.823446, abs_tol=1e-6)
    assert math.isclose(qa["quotaSpatialProxy"]["gapToOrdinary10MaxHa"], 8.309446, abs_tol=1e-6)

    print(json.dumps({
        "status": "ok",
        "assignedParcels": len(all_assigned),
        "classifiedAreaHa": 2633.94747,
        "unresolvedParcels": len(unresolved),
        "unresolvedAreaHa": unresolved_area,
        "productiveUrbanScreening": {"parcels": 184, "areaHa": 122.534554},
        "gapTo10ProxyHa": [7.823446, 8.309446],
        "exceptionUrbanScreeningHa": 98.211735,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
