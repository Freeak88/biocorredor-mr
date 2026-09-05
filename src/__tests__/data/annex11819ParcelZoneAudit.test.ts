import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';

type PolygonGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;
type Feature = {
  type: 'Feature';
  properties?: Record<string, unknown> | null;
  geometry: PolygonGeometry;
};
type FC = { type: 'FeatureCollection'; features: Feature[] };
type Zone = 'productiva' | 'recuperacion' | 'equipamiento' | 'uso_especifico';

const ROOT = process.cwd();
const GEO_DIR = path.resolve(ROOT, 'public/data/geoarba');
const AUDIT_DIR = path.resolve(ROOT, 'public/data/auditoria');
const QUADRANTS = [
  'ministro-rivadavia-parcels-noroeste.geojson',
  'ministro-rivadavia-parcels-noreste.geojson',
  'ministro-rivadavia-parcels-suroeste.geojson',
  'ministro-rivadavia-parcels-sureste.geojson',
];
const ZONE_FILES: Record<Zone, string> = {
  productiva: 'zonificacion-11819-productiva.geojson',
  recuperacion: 'zonificacion-11819-recuperacion.geojson',
  equipamiento: 'zonificacion-11819-equipamiento.geojson',
  uso_especifico: 'zonificacion-11819-uso-especifico.geojson',
};

function featureKey(feature: Feature, fallback: string) {
  const p = feature.properties ?? {};
  const partida = String(p.partida ?? '');
  const nomenclatura = String(p.nomenclatura ?? '');
  return `${partida}|${nomenclatura}` !== '|' ? `${partida}|${nomenclatura}` : fallback;
}

function loadMosaic(): Feature[] {
  const byKey = new Map<string, Feature>();
  for (const file of QUADRANTS) {
    const data = JSON.parse(fs.readFileSync(path.join(GEO_DIR, file), 'utf8')) as FC;
    data.features.forEach((feature, index) => byKey.set(featureKey(feature, `${file}:${index}`), feature));
  }
  return [...byKey.values()];
}

function loadZones() {
  const zones = new Map<Zone, Feature[]>();
  (Object.entries(ZONE_FILES) as Array<[Zone, string]>).forEach(([zone, file]) => {
    const data = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, file), 'utf8')) as FC;
    zones.set(zone, data.features);
  });
  return zones;
}

function signedRingArea(ring: number[][]) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
}

function ringCentroid(ring: number[][]): [number, number] {
  const a = signedRingArea(ring);
  if (Math.abs(a) < 1e-14) {
    const pts = ring.slice(0, -1);
    return [
      pts.reduce((s, p) => s + p[0], 0) / pts.length,
      pts.reduce((s, p) => s + p[1], 0) / pts.length,
    ];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const cross = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    cx += (ring[i][0] + ring[i + 1][0]) * cross;
    cy += (ring[i][1] + ring[i + 1][1]) * cross;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

function representativePoint(geometry: PolygonGeometry): [number, number] {
  if (geometry.type === 'Polygon') return ringCentroid(geometry.coordinates[0]);
  const polygons = geometry.coordinates;
  let best = polygons[0][0];
  let bestArea = -Infinity;
  for (const polygon of polygons) {
    const ring = polygon[0];
    const area = Math.abs(signedRingArea(ring));
    if (area > bestArea) {
      best = ring;
      bestArea = area;
    }
  }
  return ringCentroid(best);
}

function zoneAt(lon: number, lat: number, zones: Map<Zone, Feature[]>): Zone | null {
  const p = point([lon, lat]);
  const hits: Zone[] = [];
  for (const [zone, features] of zones.entries()) {
    if (features.some((feature) => booleanPointInPolygon(p, feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>))) hits.push(zone);
  }
  return hits.length === 1 ? hits[0] : null;
}

function num(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round(value: number, digits = 3) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function blankZoneNumber() {
  return { productiva: 0, recuperacion: 0, equipamiento: 0, uso_especifico: 0 } satisfies Record<Zone, number>;
}

function blankZoneCount() {
  return { productiva: 0, recuperacion: 0, equipamiento: 0, uso_especifico: 0 } satisfies Record<Zone, number>;
}

describe('Ordenanza 11.819 parcel-zone audit and 10% screening', () => {
  it('classifies the current GeoARBA mosaic against Annex I and reports quota-relevant screening metrics', () => {
    const parcels = loadMosaic();
    const zones = loadZones();
    const areaM2 = blankZoneNumber();
    const count = blankZoneCount();
    const urbanAreaM2 = blankZoneNumber();
    const urbanCount = blankZoneCount();
    let unclassifiedAreaM2 = 0;
    let unclassifiedCount = 0;
    const productiveUrbanParcels: Array<Record<string, unknown>> = [];

    for (const parcel of parcels) {
      const props = parcel.properties ?? {};
      const [lon, lat] = representativePoint(parcel.geometry);
      const zone = zoneAt(lon, lat, zones);
      const surface = num(props.superficie_m2);
      const tipo = String(props.tipo ?? '').trim().toLowerCase();
      if (!zone) {
        unclassifiedCount += 1;
        unclassifiedAreaM2 += surface;
        continue;
      }
      count[zone] += 1;
      areaM2[zone] += surface;
      if (tipo === 'urbano') {
        urbanCount[zone] += 1;
        urbanAreaM2[zone] += surface;
        if (zone === 'productiva') {
          productiveUrbanParcels.push({
            partida: props.partida ?? null,
            nomenclatura: props.nomenclatura ?? null,
            superficieHa: round(surface / 10_000, 4),
            lon: round(lon, 6),
            lat: round(lat, 6),
          });
        }
      }
    }

    const totalClassifiedM2 = Object.values(areaM2).reduce((a, b) => a + b, 0);
    const productiveHa = areaM2.productiva / 10_000;
    const textualBaseBeforeResidentialExclusionsHa = (areaM2.productiva + areaM2.uso_especifico) / 10_000;
    const totalClassifiedHa = totalClassifiedM2 / 10_000;

    const audit = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, 'hallazgos-publicos.json'), 'utf8')) as {
      cases?: Array<{ id?: string; code?: string; name?: string; lat?: number; lng?: number; kind?: string; candidateEnvelopeHa?: number; advertised?: { grossHa?: number } }>;
    };
    const caseZones = (audit.cases ?? []).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng)).map((c) => ({
      id: c.id ?? null,
      code: c.code ?? null,
      name: c.name ?? null,
      kind: c.kind ?? null,
      pointZone11819: zoneAt(Number(c.lng), Number(c.lat), zones),
      candidateEnvelopeHa: c.candidateEnvelopeHa ?? null,
      advertisedGrossHa: c.advertised?.grossHa ?? null,
    }));

    productiveUrbanParcels.sort((a, b) => Number(b.superficieHa) - Number(a.superficieHa));

    const report = {
      source: {
        zoning: 'Ordenanza 11.819/20 Anexo I, georreferenciación vectorial provisional against current GeoARBA parcel mosaic',
        cadastral: 'GeoARBA four-quadrant snapshot bundled in repository',
      },
      method: {
        parcelAssignment: 'representative point of each current cadastral geometry against Annex-I polygons',
        areaMeasure: 'GeoARBA superficie_m2 property, not geometric area',
        caution: [
          'The Annex-I georeferencing remains provisional; parcels close to a zoning boundary require manual review.',
          'Current GeoARBA Urbano is a screening signal, not proof that a club de campo was approved, sold or developed after 2018/2020.',
          'Article 3.1 defines the 10% over gross rural area after specific exclusions; Productiva alone is not the legal denominator.',
          'The textual-base scenario below excludes Recuperación and Equipamiento as spatial proxies, but still lacks the historical parcel-by-parcel exclusion of residential fractionations under 10,000 m2 and any case-specific treatment of Uso Específico.',
        ],
      },
      parcels: {
        mosaicCount: parcels.length,
        classifiedCount: Object.values(count).reduce((a, b) => a + b, 0),
        unclassifiedCount,
        unclassifiedAreaHa: round(unclassifiedAreaM2 / 10_000),
      },
      zoneSummary: (Object.keys(areaM2) as Zone[]).map((zone) => ({
        zone,
        parcelCount: count[zone],
        areaHa: round(areaM2[zone] / 10_000),
        sharePct: totalClassifiedM2 ? round((areaM2[zone] / totalClassifiedM2) * 100, 2) : 0,
        currentUrbanParcelCount: urbanCount[zone],
        currentUrbanAreaHa: round(urbanAreaM2[zone] / 10_000),
        currentUrbanShareOfZonePct: areaM2[zone] ? round((urbanAreaM2[zone] / areaM2[zone]) * 100, 2) : 0,
      })),
      quotaScenarios: {
        totalClassifiedRuralProxyHa: round(totalClassifiedHa),
        productiveOnlyProxyHa: round(productiveHa),
        productiveOnly10PctHa: round(productiveHa * 0.10),
        textualBaseBeforeResidentialExclusionsHa: round(textualBaseBeforeResidentialExclusionsHa),
        textualBaseBeforeResidentialExclusions10PctHa: round(textualBaseBeforeResidentialExclusionsHa * 0.10),
        currentUrbanInProductiveHa: round(urbanAreaM2.productiva / 10_000),
        currentUrbanInProductiveVsProductive10Pct: productiveHa ? round((urbanAreaM2.productiva / 10_000) / (productiveHa * 0.10), 3) : null,
      },
      caseZones,
      largestCurrentUrbanParcelsInProductive: productiveUrbanParcels.slice(0, 40),
    };

    const outDir = path.resolve(ROOT, 'tmp/territorial-audit');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'annex11819-parcel-zone-audit.json'), JSON.stringify(report, null, 2));

    console.log('ANNEX_11819_PARCEL_ZONE_AUDIT_BEGIN');
    console.log(JSON.stringify(report, null, 2));
    console.log('ANNEX_11819_PARCEL_ZONE_AUDIT_END');

    expect(parcels.length).toBeGreaterThan(0);
    expect(totalClassifiedM2).toBeGreaterThan(0);
    expect(count.productiva).toBeGreaterThan(0);
  });
});
