import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';

type Feature = {
  type: 'Feature';
  properties?: Record<string, unknown> | null;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
};

type FeatureCollection = {
  type: 'FeatureCollection';
  features: Feature[];
};

function flattenCoords(geometry: Feature['geometry']): number[][] {
  if (geometry.type === 'Polygon') return geometry.coordinates.flat();
  return geometry.coordinates.flat(2);
}

function geometrySummary(feature: Feature) {
  const coords = flattenCoords(feature.geometry);
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  return {
    bbox,
    approxCenter: [
      (bbox[0] + bbox[2]) / 2,
      (bbox[1] + bbox[3]) / 2,
    ],
  };
}

function parcelNumber(feature: Feature): number | null {
  const nomenclatura = String(feature.properties?.nomenclatura ?? '');
  const match = nomenclatura.match(/(\d{3})000$/);
  return match ? Number(match[1]) : null;
}

/**
 * Evidence probe for Saint Henri / Aeroclub Longchamps - La Caída.
 *
 * This test intentionally logs the GeoARBA parcel records intersected by a
 * small set of points along/around the published aerodrome reference point.
 * The output is investigative evidence, not a legal conclusion and not a
 * statement of ownership.
 */
describe('Saint Henri cadastral evidence probe', () => {
  it('reports GeoARBA parcels intersecting the aerodrome/runway sample points', () => {
    const file = path.resolve(
      process.cwd(),
      'public/data/geoarba/ministro-rivadavia-parcels-noreste.geojson',
    );
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as FeatureCollection;

    // Official transport open-data reference: LONGCHAMPS/LA CAÍDA
    // LLC: 34°51'45"S 58°20'41"W = -34.8625, -58.34472222.
    // Parapente Buenos Aires publishes its field at the same San Zeballos 1320
    // address at -34.859431,-58.350495. Extra points sample the approximately
    // E/W runway and its immediate sides; they are probes only and do not
    // define the development boundary.
    const samples: Array<[number, number, string]> = [
      [-58.34472222, -34.8625, 'ANAC/Transporte aerodrome reference'],
      [-58.3445, -34.8609, 'OSM/Mapcarta aerodrome centroid'],
      [-58.350495, -34.859431, 'San Zeballos 1320 / flight-field published point'],
      [-58.3488, -34.8631, 'runway west probe'],
      [-58.3474, -34.8629, 'runway west-centre probe'],
      [-58.3460, -34.8627, 'runway centre-west probe'],
      [-58.3434, -34.8623, 'runway centre-east probe'],
      [-58.3420, -34.8621, 'runway east-centre probe'],
      [-58.3406, -34.8619, 'runway east probe'],
      [-58.3447, -34.8595, 'north-side probe'],
      [-58.3447, -34.8650, 'south-side probe'],
    ];

    const byFeature = new Map<Feature, string[]>();
    for (const feature of data.features) {
      if (!feature.geometry || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) continue;
      for (const [lon, lat, label] of samples) {
        if (booleanPointInPolygon(point([lon, lat]), feature as never)) {
          const labels = byFeature.get(feature) ?? [];
          labels.push(label);
          byFeature.set(feature, labels);
        }
      }
    }

    const result = [...byFeature.entries()]
      .map(([feature, labels]) => ({
        parcelNumber: parcelNumber(feature),
        sampleHits: labels.length,
        samples: labels,
        properties: feature.properties ?? {},
        geometry: geometrySummary(feature),
      }))
      .sort((a, b) => b.sampleHits - a.sampleHits);

    const nearbyParcelInventory = data.features
      .map((feature) => ({ parcelNumber: parcelNumber(feature), feature }))
      .filter((item) => item.parcelNumber !== null && item.parcelNumber >= 768 && item.parcelNumber <= 793)
      .map(({ parcelNumber: number, feature }) => ({
        parcelNumber: number,
        properties: feature.properties ?? {},
        geometry: geometrySummary(feature),
      }))
      .sort((a, b) => (a.parcelNumber ?? 0) - (b.parcelNumber ?? 0));

    const totalCandidateAreaM2 = result.reduce((sum, item) => {
      const area = Number(item.properties.superficie_m2 ?? 0);
      return sum + (Number.isFinite(area) ? area : 0);
    }, 0);

    console.log('SAINT_HENRI_PARCEL_PROBE_BEGIN');
    console.log(JSON.stringify({
      source: 'GeoARBA parcel layer 110101, Almirante Brown; local project snapshot',
      referencePoint: { lon: -58.34472222, lat: -34.8625 },
      resultCount: result.length,
      distinctCandidateAreaM2: totalCandidateAreaM2,
      distinctCandidateAreaHa: totalCandidateAreaM2 / 10000,
      results: result,
      nearbyParcelInventory,
    }, null, 2));
    console.log('SAINT_HENRI_PARCEL_PROBE_END');

    expect(data.features.length).toBeGreaterThan(0);
  });
});
