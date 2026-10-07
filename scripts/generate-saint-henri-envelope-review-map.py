#!/usr/bin/env python3
"""Genera un mapa HTML interactivo para revisar hipótesis catastrales de Saint Henri.

El mapa NO determina el límite real del emprendimiento. Sirve para comparar visualmente
las hipótesis conectadas de ~55 ha contra GeoARBA actual y membresía Productivo.
"""
from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path

DEFAULT_HYP = Path(
    "tmp/territorial-analysis/public-commercial-evidence/cadastral-envelope-hypotheses/"
    "saint-henri-aero-country-club-cadastral-envelope-hypotheses.geojson"
)
DEFAULT_ASSIGN = Path("public/data/auditoria/zonificacion-11819-asignaciones.json.gz")
DEFAULT_GEOARBA = [
    Path("public/data/geoarba/ministro-rivadavia-parcels-noreste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-noroeste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-sureste.geojson"),
    Path("public/data/geoarba/ministro-rivadavia-parcels-suroeste.geojson"),
]
DEFAULT_OUT = Path(
    "tmp/territorial-analysis/public-commercial-evidence/cadastral-envelope-hypotheses/"
    "saint-henri-envelope-review.html"
)
ANCHOR = [-34.8549898, -58.342622]


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--hypotheses", type=Path, default=DEFAULT_HYP)
    p.add_argument("--assignments", type=Path, default=DEFAULT_ASSIGN)
    p.add_argument("--geoarba", nargs="+", type=Path, default=DEFAULT_GEOARBA)
    p.add_argument("--output", type=Path, default=DEFAULT_OUT)
    p.add_argument("--top", type=int, default=10)
    return p.parse_args()


def load_json(path: Path):
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            return json.load(fh)
    return json.loads(path.read_text(encoding="utf-8"))


def load_productivo(path: Path) -> set[str]:
    d = load_json(path)
    vals = d.get("zones", {}).get("productiva", [])
    out = set()
    for x in vals:
        if isinstance(x, str):
            out.add(x)
        elif isinstance(x, dict):
            n = x.get("nomenclatura") or x.get("id")
            if n:
                out.add(str(n))
    return out


def parcel_fc(paths: list[Path], membership: set[str]) -> dict:
    feats = []
    seen = set()
    for p in paths:
        d = load_json(p)
        for f in d.get("features", []):
            props = f.get("properties") or {}
            nom = str(props.get("nomenclatura") or "")
            if not nom or nom in seen:
                continue
            seen.add(nom)
            feats.append({
                "type": "Feature",
                "geometry": f.get("geometry"),
                "properties": {
                    "nomenclatura": nom,
                    "partida": str(props.get("partida") or ""),
                    "productivo": nom in membership,
                    "superficie_m2": props.get("superficie_m2"),
                },
            })
    return {"type": "FeatureCollection", "features": feats}


def rank_value(f: dict) -> int:
    p = f.get("properties") or {}
    for k in ("rank", "hypothesis_rank", "ranking"):
        try:
            return int(p.get(k))
        except Exception:
            pass
    return 999999


def main():
    a = parse_args()
    a.output.parent.mkdir(parents=True, exist_ok=True)
    membership = load_productivo(a.assignments)
    parcels = parcel_fc(a.geoarba, membership)
    hyp = load_json(a.hypotheses)
    features = sorted(hyp.get("features", []), key=rank_value)[: a.top]
    hyp_top = {"type": "FeatureCollection", "features": features}

    html = f'''<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Saint Henri — QA hipótesis catastrales</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
html,body,#map{{height:100%;margin:0}} .info{{background:white;padding:8px 10px;font:13px system-ui;box-shadow:0 1px 5px #777;border-radius:4px;max-width:360px}}
.legend i{{width:14px;height:14px;display:inline-block;margin-right:6px;vertical-align:-2px}}
</style></head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const parcels={json.dumps(parcels, ensure_ascii=False)};
const hypotheses={json.dumps(hyp_top, ensure_ascii=False)};
const map=L.map('map').setView([{ANCHOR[0]},{ANCHOR[1]}],15);
L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png',{{maxZoom:19,attribution:'© OpenStreetMap'}}).addTo(map);
const parcelLayer=L.geoJSON(parcels,{{
  style:f=>({{color:f.properties.productivo?'#15803d':'#64748b',weight:f.properties.productivo?1.4:0.8,fillColor:f.properties.productivo?'#22c55e':'#94a3b8',fillOpacity:f.properties.productivo?0.10:0.03}}),
  onEachFeature:(f,l)=>l.bindPopup(`<b>${{f.properties.productivo?'Productivo':'No Productivo'}}</b><br>Partida: ${{f.properties.partida}}<br>Nomenclatura: ${{f.properties.nomenclatura}}`)
}}).addTo(map);
const overlays={{'GeoARBA (Productivo / resto)':parcelLayer}};
const palette=['#dc2626','#2563eb','#9333ea','#ea580c','#0891b2','#be123c','#4f46e5','#65a30d','#c026d3','#0f766e'];
(hypotheses.features||[]).forEach((f,i)=>{{
  const p=f.properties||{{}}; const rank=p.rank||p.hypothesis_rank||i+1;
  const name=`Hipótesis ${{rank}} — Productivo ${{p.productivo_share_pct ?? p.productivo_share ?? '?'}}%`;
  const layer=L.geoJSON(f,{{style:{{color:palette[i%palette.length],weight:4,fillOpacity:0.08}},onEachFeature:(ff,l)=>l.bindPopup(`<b>Hipótesis ${{rank}}</b><br>Área: ${{p.area_ha ?? '?'}} ha<br>Productivo: ${{p.productivo_share_pct ?? p.productivo_share ?? '?'}}%<br>Parcelas: ${{p.parcels ?? p.parcel_count ?? '?'}}`)}});
  overlays[name]=layer;
  if(i<2) layer.addTo(map);
}});
L.marker([{ANCHOR[0]},{ANCHOR[1]}]).addTo(map).bindPopup('<b>Ancla comercial Saint Henri</b><br>No implica centro ni límite del proyecto.');
L.control.layers(null,overlays,{{collapsed:false}}).addTo(map);
const info=L.control({{position:'bottomleft'}}); info.onAdd=()=>{{const d=L.DomUtil.create('div','info');d.innerHTML='<b>QA Saint Henri</b><br>Compará especialmente hipótesis 1 (~29% Productivo) vs 2 (~70%).<br>El área ~55 ha sólo es un filtro de plausibilidad, no prueba el polígono.';return d}};info.addTo(map);
const legend=L.control({{position:'bottomright'}}); legend.onAdd=()=>{{const d=L.DomUtil.create('div','info legend');d.innerHTML='<i style="background:#22c55e"></i>Productivo<br><i style="background:#94a3b8"></i>No Productivo';return d}};legend.addTo(map);
</script></body></html>'''
    a.output.write_text(html, encoding="utf-8")
    print("=== SAINT HENRI ENVELOPE REVIEW MAP ===")
    print(f"hypotheses_loaded={len(features)}")
    print(f"productivo_membership={len(membership)}")
    print(f"html={a.output}")


if __name__ == "__main__":
    main()
