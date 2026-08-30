import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type Feature = {
  type: 'Feature';
  properties?: Record<string, unknown> | null;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
};
type FC = { type: 'FeatureCollection'; features: Feature[] };

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

describe('GeoARBA compact parcel export for Annex I registration', () => {
  it('exports cadastral metadata, official area field and geometry snapshot as audit artifacts', () => {
    const geoPath = path.resolve(process.cwd(), 'public/data/geoarba/ministro-rivadavia-parcels.geojson');
    const rawGeo = fs.readFileSync(geoPath, 'utf8');
    const data = JSON.parse(rawGeo) as FC;
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
      source: 'GeoARBA layer 110101, local project snapshot',
      featureCount: rows.length,
      rows,
      caution: 'bboxCenter is a registration/navigation anchor, not a legal centroid or mensura coordinate. superficie_m2 is copied from the source feature metadata when present.',
    }));
    fs.writeFileSync(path.join(outDir, 'ministro-rivadavia-parcels.geojson'), rawGeo);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => typeof row.superficie_m2 === 'number')).toBe(true);
  });
});
