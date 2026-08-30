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

const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
];
const TMP_DIR = path.resolve(process.cwd(), 'tmp/territorial-audit');
const GEO_DIR = path.resolve(process.cwd(), 'public/data/geoarba');
const QUADRANTS = [
  'ministro-rivadavia-parcels-noroeste.geojson',
  'ministro-rivadavia-parcels-noreste.geojson',
  'ministro-rivadavia-parcels-suroeste.geojson',
  'ministro-rivadavia-parcels-sureste.geojson',
];
const CENTER: XY = [-58.35, -34.86];
const METERS_PER_DEG_LAT = 111_320;
const METERS_PER_DEG_LON = METERS_PER_DEG_LAT * Math.cos(CENTER[1] * Math.PI / 180);

function featureKey(feature: Feature, fallback: string) {
  const p = feature.properties ?? {};
  const partida = String(p.partida ?? '');
  const nomenclatura = String(p.nomenclatura ?? '');
  return `${partida}|${nomenclatura}` !== '|' ? `${partida}|${nomenclatura}` : fallback;
}

function loadMosaic(): FC {
  const byKey = new Map<string, Feature>();
  for (const file of QUADRANTS) {
    const data = JSON.parse(fs.readFileSync(path.join(GEO_DIR, file), 'utf8')) as FC;
    data.features.forEach((feature, index) => byKey.set(featureKey(feature, `${file}:${index}`), feature));
  }
  return { type: 'FeatureCollection', features: [...byKey.values()] };
}

function normalizeName(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function toLocal(p: XY): XY {
  return [(p[0] - CENTER[0]) * METERS_PER_DEG_LON, (p[1] - CENTER[1]) * METERS_PER_DEG_LAT];
}

function fromLocal(p: XY): XY {
  return [CENTER[0] + p[0] / METERS_PER_DEG_LON, CENTER[1] + p[1] / METERS_PER_DEG_LAT];
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

function distanceMeters(a: XY, b: XY) {
  const la = toLocal(a);
  const lb = toLocal(b);
  return Math.sqrt(distance2(la, lb));
}

function closestPointOnSegment(p: XY, a: XY, b: XY): XY {
  const ab: XY = [b[0] - a[0], b[1] - a[1]];
  const ap: XY = [p[0] - a[0], p[1] - a[1]];
  const denom = ab[0] * ab[0] + ab[1] * ab[1];
  if (denom === 0) return a;
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1]) / denom));
  return [a[0] + t * ab[0], a[1] + t * ab[1]];
}

function closestBetweenSegments(a: XY, b: XY, c: XY, d: XY) {
  const ai = toLocal(a), bi = toLocal(b), ci = toLocal(c), di = toLocal(d);
  const candidates: Array<{ pa: XY; pb: XY }> = [
    { pa: ai, pb: closestPointOnSegment(ai, ci, di) },
    { pa: bi, pb: closestPointOnSegment(bi, ci, di) },
    { pa: closestPointOnSegment(ci, ai, bi), pb: ci },
    { pa: closestPointOnSegment(di, ai, bi), pb: di },
  ];
  const best = candidates.sort((x, y) => distance2(x.pa, x.pb) - distance2(y.pa, y.pb))[0];
  const pa = fromLocal(best.pa);
  const pb = fromLocal(best.pb);
  return {
    aPoint: pa,
    bPoint: pb,
    midpoint: [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2] as XY,
    distanceM: distanceMeters(pa, pb),
  };
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

function closestApproaches(aWays: OsmWay[], bWays: OsmWay[]) {
  const out: Array<{
    midpoint: XY;
    aPoint: XY;
    bPoint: XY;
    distanceM: number;
    aWay: number;
    bWay: number;
    aName?: string;
    bName?: string;
  }> = [];
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
          const close = closestBetweenSegments(a1, a2, b1, b2);
          out.push({ ...close, aWay: aw.id, bWay: bw.id, aName: aw.tags?.name, bName: bw.tags?.name });
        }
      }
    }
  }
  return out.sort((a, b) => a.distanceM - b.distanceM || distance2(a.midpoint, CENTER) - distance2(b.midpoint, CENTER));
}

function parcelHits(data: FC, lon: number, lat: number) {
  const p = point([lon, lat]);
  return data.features
    .filter((f) => f.geometry && booleanPointInPolygon(p, f as never))
    .map((f) => f.properties ?? {});
}

function flattenCoords(geometry: Feature['geometry']): number[][] {
  if (geometry.type === 'Polygon') return geometry.coordinates.flat();
  return geometry.coordinates.flat(2);
}

function bboxCenter(feature: Feature): XY {
  const coords = flattenCoords(feature.geometry);
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

function nearbyParcels(data: FC, p: XY, radiusM = 500) {
  return data.features
    .map((feature) => ({ feature, center: bboxCenter(feature) }))
    .map(({ feature, center }) => ({
      distanceM: distanceMeters(center, p),
      properties: feature.properties ?? {},
      bboxCenter: center,
    }))
    .filter((row) => row.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 200);
}

async function overpassWays() {
  const query = `[out:json][timeout:30];\nway["highway"]["name"](around:8000,${CENTER[1]},${CENTER[0]});\nout geom;`;
  const attempts: Array<{ endpoint: string; status?: number; error?: string }> = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'biocorredor-mr-territorial-audit/1.0',
        },
        body: new URLSearchParams({ data: query }),
      });
      attempts.push({ endpoint, status: r.status });
      if (!r.ok) continue;
      const json = await r.json() as OverpassResponse;
      const ways = (json.elements ?? []).filter((e) => Array.isArray(e.geometry));
      if (ways.length) return { ways, endpoint, attempts };
    } catch (error) {
      attempts.push({ endpoint, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { ways: [] as OsmWay[], endpoint: null, attempts };
}

describe('Estancias del Sur street-corridor -> GeoARBA probe', () => {
  it('resolves exact intersections when present and otherwise records the closest named-linework approach against the full local cadastre mosaic', async () => {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const data = loadMosaic();
    const overpass = await overpassWays();
    const ways = overpass.ways;

    const chivilcoy = ways.filter((w) => normalizeName(w.tags?.name).includes('chivilcoy'));
    const calderon = ways.filter((w) => {
      const n = normalizeName(w.tags?.name);
      return n.includes('calderon') && (n.includes('brigadier') || n.includes('manuel'));
    });

    const exact = intersections(chivilcoy, calderon)
      .sort((a, b) => distance2(a.point, CENTER) - distance2(b.point, CENTER));
    const exactCandidates = exact.map((hit) => ({
      ...hit,
      geoArbaHits: parcelHits(data, hit.point[0], hit.point[1]),
    }));

    const closest = closestApproaches(chivilcoy, calderon).slice(0, 10).map((hit) => ({
      ...hit,
      geoArbaHitsAtMidpoint: parcelHits(data, hit.midpoint[0], hit.midpoint[1]),
    }));
    const bestAnchor = exactCandidates[0]?.point ?? closest[0]?.midpoint ?? null;
    const near = bestAnchor ? nearbyParcels(data, bestAnchor, 600) : [];
    const areaMatch16122 = near.filter((row) => {
      const value = Number(row.properties.superficie_m2 ?? row.properties.superficie ?? NaN);
      return Number.isFinite(value) && Math.abs(value - 16122) <= 5000;
    });

    const report = {
      source: 'OpenStreetMap linework via Overpass + four-quadrant local GeoARBA mosaic',
      mosaicFeatureCount: data.features.length,
      independentCommercialClue: {
        description: 'A separate public listing by Torchia Cicutti describes a 55 m x 293.13 m, 16,122 m² parcel at Av. Chivilcoy y Calderón. This is a search clue, not proof that the parcel is Estancias del Sur.',
        targetAreaM2: 16122,
      },
      overpassEndpoint: overpass.endpoint,
      overpassAttempts: overpass.attempts,
      queryCenter: { lon: CENTER[0], lat: CENTER[1] },
      streetWayCounts: { chivilcoy: chivilcoy.length, calderon: calderon.length },
      exactCandidates,
      closestApproaches: closest,
      bestAnchor: bestAnchor ? { lon: bestAnchor[0], lat: bestAnchor[1] } : null,
      nearbyParcelCount: near.length,
      nearbyParcels: near,
      areaMatch16122,
      evidenceStatus: exactCandidates.length
        ? 'intersection_found'
        : closest[0] && closest[0].distanceM <= 100
          ? 'closest_linework_anchor_under_100m'
          : 'network_or_osm_linework_unresolved',
      caution: 'The street/corridor anchor and the 16,122 m² listing are navigation/search evidence only. Neither establishes the Estancias del Sur polygon, ownership, approval, zoning or legality.',
    };

    fs.writeFileSync(path.join(TMP_DIR, 'estancias-del-sur-intersection.json'), JSON.stringify(report, null, 2));
    console.log('ESTANCIAS_DEL_SUR_INTERSECTION_PROBE_BEGIN');
    console.log(JSON.stringify(report, null, 2));
    console.log('ESTANCIAS_DEL_SUR_INTERSECTION_PROBE_END');

    expect(data.features.length).toBeGreaterThan(0);
  }, 120_000);
});
