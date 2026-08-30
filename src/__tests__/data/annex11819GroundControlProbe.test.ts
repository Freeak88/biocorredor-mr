import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type Feature = {
  type: 'Feature';
  properties?: Record<string, unknown> | null;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
};
type FC = { type: 'FeatureCollection'; features: Feature[] };

const GEO_DIR = path.resolve(process.cwd(), 'public/data/geoarba');
const QUADRANTS = [
  'ministro-rivadavia-parcels-noroeste.geojson',
  'ministro-rivadavia-parcels-noreste.geojson',
  'ministro-rivadavia-parcels-suroeste.geojson',
  'ministro-rivadavia-parcels-sureste.geojson',
];

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

function flattenCoords(geometry: Feature['geometry']): number[][] {
  if (geometry.type === 'Polygon') return geometry.coordinates.flat();
  return geometry.coordinates.flat(2);
}

function circIVParcelNumber(feature: Feature): number | null {
  const nomenclatura = String(feature.properties?.nomenclatura ?? '');
  // 003 = Almirante Brown; 04 = Circunscripción IV in the GeoARBA nomenclature used here.
  if (!nomenclatura.startsWith('00304')) return null;
  const match = nomenclatura.match(/(\d{3})000$/);
  return match ? Number(match[1]) : null;
}

function geometrySummary(feature: Feature) {
  const coords = flattenCoords(feature.geometry);
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  return {
    bbox,
    bboxCenter: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
  };
}

describe('Ordenanza 11.819 Annex I ground-control GeoARBA probe', () => {
  it('reports Circ. IV candidate controls across the complete four-quadrant GeoARBA mosaic', () => {
    const data = loadMosaic();

    const targetParcels = [
      667, 668, 680, 681, 685, 690, 693, 697, 700,
      727, 743, 746, 747, 748, 750,
      768, 769, 770, 771, 772, 773, 774, 775, 776, 777, 778, 779, 780, 781, 782, 783, 784, 785, 787,
      790, 791, 792, 793, 803, 814, 817, 826,
    ];

    const result = targetParcels.map((target) => {
      const matches = data.features.filter((f) => circIVParcelNumber(f) === target);
      return {
        parcelNumber: target,
        matchCount: matches.length,
        matches: matches.map((feature) => ({
          properties: feature.properties ?? {},
          geometry: geometrySummary(feature),
        })),
      };
    });
    const uniqueCurrentAnchors = result.filter((r) => r.matchCount === 1);

    const report = {
      source: 'GeoARBA parcel layer 110101, Almirante Brown; four local quadrant snapshots mosaicked',
      mosaicFeatureCount: data.features.length,
      targetParcels,
      uniqueCurrentAnchorCount: uniqueCurrentAnchors.length,
      uniqueCurrentAnchors,
      allResults: result,
      caution: 'Annex I labels are from 2020 and GeoARBA is a later cadastral snapshot. Missing exact parcel numbers must not be treated as missing land: they may have been subdivided or renumbered. Pixel coordinates still require visual review of the official annex before fitting any transform.',
    };
    const outDir = path.resolve(process.cwd(), 'tmp/territorial-audit');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'annex11819-ground-controls.json'), JSON.stringify(report, null, 2));

    console.log('ANNEX_11819_GROUND_CONTROL_PROBE_BEGIN');
    console.log(JSON.stringify(report, null, 2));
    console.log('ANNEX_11819_GROUND_CONTROL_PROBE_END');

    expect(data.features.length).toBeGreaterThan(0);
    expect(uniqueCurrentAnchors.length).toBeGreaterThan(0);
  });
});
