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

function parcelNumber(feature: Feature): number | null {
  const nomenclatura = String(feature.properties?.nomenclatura ?? '');
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
  it('reports geographically distributed parcel centers for image-to-cadastre registration', () => {
    const geoPath = path.resolve(process.cwd(), 'public/data/geoarba/ministro-rivadavia-parcels.geojson');
    const data = JSON.parse(fs.readFileSync(geoPath, 'utf8')) as FC;
    // Selected because their labels are visually legible and spatially distributed
    // across Annex I. Pixel coordinates are intentionally NOT stored here until
    // independently reviewed against the official rendered annex.
    const targetParcels = [668, 681, 700, 743, 776, 803, 814, 817, 826];

    const result = targetParcels.map((target) => {
      const matches = data.features.filter((f) => parcelNumber(f) === target);
      return {
        parcelNumber: target,
        matchCount: matches.length,
        matches: matches.map((feature) => ({
          properties: feature.properties ?? {},
          geometry: geometrySummary(feature),
        })),
      };
    });

    console.log('ANNEX_11819_GROUND_CONTROL_PROBE_BEGIN');
    console.log(JSON.stringify({
      source: 'GeoARBA parcel layer 110101, Almirante Brown; local project snapshot',
      targetParcels,
      result,
      caution: 'Ground-control parcel labels must be visually verified in the official Annex I before fitting any image-to-coordinate transform. Bbox centers are registration anchors, not legal centroids or mensura points.',
    }, null, 2));
    console.log('ANNEX_11819_GROUND_CONTROL_PROBE_END');

    expect(data.features.length).toBeGreaterThan(0);
    expect(result.filter((r) => r.matchCount === 1).length).toBeGreaterThanOrEqual(6);
  });
});
