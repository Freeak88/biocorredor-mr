import fs from 'node:fs';
import path from 'node:path';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import { describe, expect, it } from 'vitest';

type OsmNode = { lat: number; lon: number };
type OsmWay = { id: number; tags?: Record<string, string>; geometry?: OsmNode[] };
type OverpassResponse = { elements?: OsmWay[] };
type Feature = {
  type: 'Feature';
  properties?: Record<string, unknown> | null;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
};
type FC = { type: 'FeatureCollection'; features: Feature[] };

type XY = [number, number];

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const TMP_DIR = path.resolve(process.cwd(), 'tmp/territorial-audit');
const CENTER: XY = [-58.35, -34.86];

function normalizeName(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function segmentIntersection(a: XY, b: XY, c: XY, d: XY): XY | null {
  const x1 = a[0], y1 = a[1], x2 = b[0], y2 = b[1];
  const x3 = c[0], y3 = c[1], x4 = d[0], y4 = d[1];
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-14) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

function distance2(a: XY, b: XY) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function intersections(aWays: OsmWay[], bWays: OsmWay[]) {
  const out: Array<{ point: XY; aWay: number; bWay: number; aName?: string; bName?: string }> = [];
  for (const aw of aWays) {
    const ag = aw.geometry ?? [];
    for (const bw of bWays) {
      const bg = bw.geometry ?? [];
      for (let i = 0; i + 1 < ag.length; i += 1) {
        const a1: XY = [ag[i].lon, ag[i].lat];
        const a2: XY = [ag[i + 1].lon, ag[i + 1].lat];
        for (let j = 0; j + 1 < bg.length; j += 1) {
          const b1: XY = [bg[j].lon, bg[j].lat];
          const b2: XY = [bg[j + 1].lon, bg[j + 1].lat];
          const p = segmentIntersection(a1, a2, b1, b2);
          if (p) out.push({ point: p, aWay: aw.id, bWay: bw.id, aName: aw.tags?.name, bName: bw.tags?.name });
        }
      }
    }
  }
  return out;
}

function parcelHits(data: FC, lon: number, lat: number) {
  const p = point([lon, lat]);
  return data.features
    .filter((f) => f.geometry && booleanPointInPolygon(p, f as never))
    .map((f) => f.properties ?? {});
}

async function overpassWays() {
  const query = `[out:json][timeout:45];\n(\n  way["highway"]["name"](around:8000,${CENTER[1]},${CENTER[0]});\n);\nout geom;`;
  const r = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ data: query }),
  });
  expect(r.ok).toBe(true);
  const json = await r.json() as OverpassResponse;
  return (json.elements ?? []).filter((e) => Array.isArray(e.geometry));
}

describe('Estancias del Sur exact street-intersection -> GeoARBA probe', () => {
  it('finds the Chivilcoy / Brigadier Manuel Calderon intersection from OSM linework and reports cadastral hits without assigning the development boundary', async () => {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const geoPath = path.resolve(process.cwd(), 'public/data/geoarba/ministro-rivadavia-parcels.geojson');
    const data = JSON.parse(fs.readFileSync(geoPath, 'utf8')) as FC;
    const ways = await overpassWays();

    const chivilcoy = ways.filter((w) => normalizeName(w.tags?.name).includes('chivilcoy'));
    const calderon = ways.filter((w) => {
      const n = normalizeName(w.tags?.name);
      return n.includes('calderon') && (n.includes('brigadier') || n.includes('manuel'));
    });

    const all = intersections(chivilcoy, calderon)
      .sort((a, b) => distance2(a.point, CENTER) - distance2(b.point, CENTER));

    const candidates = all.map((hit) => ({
      ...hit,
      geoArbaHits: parcelHits(data, hit.point[0], hit.point[1]),
    }));

    const report = {
      source: 'OpenStreetMap linework via Overpass + local GeoARBA snapshot',
      queryCenter: { lon: CENTER[0], lat: CENTER[1] },
      streetWayCounts: { chivilcoy: chivilcoy.length, calderon: calderon.length },
      candidates,
      caution: 'The exact street intersection is a deterministic navigation anchor. A containing parcel at the corner does not by itself establish the Estancias del Sur polygon, ownership, approval, zoning or legality.',
    };

    fs.writeFileSync(path.join(TMP_DIR, 'estancias-del-sur-intersection.json'), JSON.stringify(report, null, 2));
    console.log('ESTANCIAS_DEL_SUR_INTERSECTION_PROBE_BEGIN');
    console.log(JSON.stringify(report, null, 2));
    console.log('ESTANCIAS_DEL_SUR_INTERSECTION_PROBE_END');

    expect(data.features.length).toBeGreaterThan(0);
    expect(chivilcoy.length).toBeGreaterThan(0);
    expect(calderon.length).toBeGreaterThan(0);
    expect(candidates.length).toBeGreaterThan(0);
  }, 120_000);
});
