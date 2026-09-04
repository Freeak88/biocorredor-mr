import fs from 'node:fs';
import path from 'node:path';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import { describe, expect, it } from 'vitest';

type Feature = {
  type: 'Feature';
  properties?: Record<string, unknown> | null;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
};
type FC = { type: 'FeatureCollection'; features: Feature[] };

type Case = {
  id: string;
  name: string;
  queries: string[];
};

const cases: Case[] = [
  {
    id: 'parque-america',
    name: 'Barrio Parque America',
    queries: [
      'Barrio Parque America, Ministro Rivadavia, Almirante Brown, Buenos Aires, Argentina',
      'General Brigadier Manuel Calderon 1101, Ministro Rivadavia, Almirante Brown, Buenos Aires, Argentina',
    ],
  },
  {
    id: 'la-ramona',
    name: 'La Ramona',
    queries: [
      'Barrio La Ramona, Ministro Rivadavia, Almirante Brown, Buenos Aires, Argentina',
      'Rivera 860, Ministro Rivadavia, Almirante Brown, Buenos Aires, Argentina',
    ],
  },
  {
    id: 'don-vicente',
    name: 'Barrio Don Vicente',
    queries: [
      'Barrio Don Vicente, Ministro Rivadavia, Almirante Brown, Buenos Aires, Argentina',
      'General Brigadier Manuel Calderon 3422, Ministro Rivadavia, Almirante Brown, Buenos Aires, Argentina',
    ],
  },
  {
    id: 'portal-del-sol-i',
    name: 'Portal del Sol I',
    queries: [
      'Portal del Sol, Ministro Rivadavia, Almirante Brown, Buenos Aires, Argentina',
      'Avenida Chivilcoy 578, Ministro Rivadavia, Almirante Brown, Buenos Aires, Argentina',
    ],
  },
  {
    id: 'estancias-del-sur',
    name: 'Estancias del Sur',
    queries: [
      'Avenida Chivilcoy General Brigadier Manuel Calderon, Ministro Rivadavia, Almirante Brown, Buenos Aires, Argentina',
      'Estancias del Sur, Ministro Rivadavia, Almirante Brown, Buenos Aires, Argentina',
    ],
  },
  {
    id: 'altos-de-espora',
    name: 'Altos de Espora',
    queries: [
      'Altos de Espora, Longchamps, Almirante Brown, Buenos Aires, Argentina',
      'Avenida Espora 7300, Longchamps, Almirante Brown, Buenos Aires, Argentina',
    ],
  },
  {
    id: 'condominio-25-mayo-2100',
    name: 'Condominio 25 de Mayo 2100',
    queries: [
      '25 de Mayo 2100, Ministro Rivadavia, Almirante Brown, Buenos Aires, Argentina',
    ],
  },
];

async function geocode(query: string) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '3');
  url.searchParams.set('countrycodes', 'ar');
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'biocorredor-mr-territorial-audit/1.0 (public-interest verification probe)',
      'Accept-Language': 'es-AR,es;q=0.9',
    },
  });
  if (!r.ok) return [];
  return await r.json() as Array<Record<string, unknown>>;
}

function parcelHits(data: FC, lon: number, lat: number) {
  const p = point([lon, lat]);
  return data.features
    .filter((f) => f.geometry && booleanPointInPolygon(p, f as never))
    .map((f) => f.properties ?? {});
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Detected developments -> geocoder -> GeoARBA evidence probe', () => {
  it('resolves public anchors and reports intersecting cadastral parcels without inferring ownership', async () => {
    const geoPath = path.resolve(process.cwd(), 'public/data/geoarba/ministro-rivadavia-parcels.geojson');
    const data = JSON.parse(fs.readFileSync(geoPath, 'utf8')) as FC;
    const results = [];

    for (const c of cases) {
      let chosen: Record<string, unknown> | null = null;
      let usedQuery: string | null = null;
      const attempts = [];
      for (const q of c.queries) {
        const found = await geocode(q);
        attempts.push({ query: q, found });
        if (!chosen && found.length) {
          chosen = found[0];
          usedQuery = q;
        }
        await sleep(1100);
      }

      const lat = chosen ? Number(chosen.lat) : NaN;
      const lon = chosen ? Number(chosen.lon) : NaN;
      const hits = Number.isFinite(lat) && Number.isFinite(lon) ? parcelHits(data, lon, lat) : [];
      results.push({
        id: c.id,
        name: c.name,
        usedQuery,
        anchor: chosen ? {
          lat,
          lon,
          display_name: chosen.display_name,
          osm_type: chosen.osm_type,
          osm_id: chosen.osm_id,
          type: chosen.type,
          class: chosen.class,
          importance: chosen.importance,
        } : null,
        geoArbaHits: hits,
        attempts,
        caution: 'A geocoded address/place point is only a navigation anchor. A parcel hit does not establish the development boundary, ownership, approval or legality.',
      });
    }

    console.log('DEVELOPMENTS_GEOARBA_PROBE_BEGIN');
    console.log(JSON.stringify({ source: 'Nominatim/OSM + local GeoARBA snapshot', results }, null, 2));
    console.log('DEVELOPMENTS_GEOARBA_PROBE_END');

    expect(data.features.length).toBeGreaterThan(0);
  }, 120_000);
});
