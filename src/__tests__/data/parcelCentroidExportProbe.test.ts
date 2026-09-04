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

function flattenCoords(geometry: Feature['geometry']): number[][] {
  if (geometry.type === 'Polygon') return geometry.coordinates.flat();
  return geometry.coordinates.flat(2);
}

function bboxSummary(feature: Feature) {
  const coords = flattenCoords(feature.geometry);
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  return { bbox, bboxCenter: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2] };
}

function featureKey(feature: Feature, fallback: string) {
  const p = feature.properties ?? {};
  const partida = String(p.partida ?? '');
  const nomenclatura = String(p.nomenclatura ?? '');
  return `${partida}|${nomenclatura}` !== '|' ? `${partida}|${nomenclatura}` : fallback;
}

function loadMosaic() {
  const byKey = new Map<string, Feature>();
  const sourceCounts: Record<string, number> = {};
  for (const file of QUADRANTS) {
    const fullPath = path.join(GEO_DIR, file);
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as FC;
    sourceCounts[file] = data.features.length;
    data.features.forEach((feature, index) => {
      byKey.set(featureKey(feature, `${file}:${index}`), feature);
    });
  }
  return {
    data: { type: 'FeatureCollection', features: [...byKey.values()] } as FC,
    sourceCounts,
  };
}

describe('GeoARBA compact parcel export for Annex I registration', () => {
  it('mosaics all four local GeoARBA quadrants and exports cadastral areas, anchors and geometry', () => {
    const { data, sourceCounts } = loadMosaic();
    const rows = data.features.map((feature, index) => {
      const props = feature.properties ?? {};
      return {
        index,
        nomenclatura: props.nomenclatura ?? null,
        partida: props.partida ?? null,
        parcela: props.parcela ?? null,
        tipo: props.tipo ?? null,
        superficie_m2: props.superficie_m2 ?? props.superficie ?? null,
        plano: props.plano ?? null,
        ...bboxSummary(feature),
      };
    });
    const outDir = path.resolve(process.cwd(), 'tmp/territorial-audit');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'parcel-centroids.json'), JSON.stringify({
      source: 'GeoARBA layer 110101; four local quadrant snapshots mosaicked and deduplicated by partida+nomenclatura',
      sourceCounts,
      featureCount: rows.length,
      rows,
      caution: 'bboxCenter is a registration/navigation anchor, not a legal centroid or mensura coordinate. superficie_m2 is copied from the source feature metadata when present.',
    }));
    fs.writeFileSync(path.join(outDir, 'geoarba-audit-mosaic.geojson'), JSON.stringify(data));
    expect(Object.keys(sourceCounts)).toHaveLength(4);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => typeof row.superficie_m2 === 'number')).toBe(true);
  });
});
