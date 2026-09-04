import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type WaybackConfigItem = {
  itemTitle?: string;
  itemURL?: string;
  layerURL?: string;
  metadataLayerUrl?: string;
  layerIdentifier?: string;
  releaseDateLabel?: string;
};
type MetadataResponse = { features?: Array<{ attributes?: Record<string, unknown> }>; error?: unknown };

type AuditPoint = {
  id: string;
  annexZone: 'recovery' | 'specific_use';
  longitude: number;
  latitude: number;
  currentUrbanClusterAreaHa: number;
  currentUrbanFeatureCount: number;
  priority: 'high' | 'medium';
};

const CONFIG_URL = 'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json';
const ZOOM = 17;
const OUTPUT_DIR = path.resolve(process.cwd(), 'tmp/territorial-audit/exception-wayback');

// These are screening centroids of clusters of CURRENT GeoARBA features whose `tipo` is Urbano
// and whose registered Annex-I class is Recuperación or Uso Específico. They are NOT development
// boundaries and do not prove post-2020 urbanisation. Historical imagery is archived precisely to
// distinguish pre-existing subdivisions from later physical transformation.
const POINTS: AuditPoint[] = [
  { id: 'R9', annexZone: 'recovery', longitude: -58.319987, latitude: -34.854132, currentUrbanClusterAreaHa: 39.99, currentUrbanFeatureCount: 38, priority: 'high' },
  { id: 'R6', annexZone: 'recovery', longitude: -58.326211, latitude: -34.840822, currentUrbanClusterAreaHa: 18.40, currentUrbanFeatureCount: 17, priority: 'high' },
  { id: 'R10', annexZone: 'recovery', longitude: -58.309731, latitude: -34.849853, currentUrbanClusterAreaHa: 9.715, currentUrbanFeatureCount: 6, priority: 'high' },
  { id: 'U9', annexZone: 'specific_use', longitude: -58.322297, latitude: -34.853687, currentUrbanClusterAreaHa: 3.240, currentUrbanFeatureCount: 3, priority: 'high' },
  { id: 'U10', annexZone: 'specific_use', longitude: -58.312764, latitude: -34.848084, currentUrbanClusterAreaHa: 1.485, currentUrbanFeatureCount: 3, priority: 'medium' },
  { id: 'U4', annexZone: 'specific_use', longitude: -58.352350, latitude: -34.840429, currentUrbanClusterAreaHa: 0.599, currentUrbanFeatureCount: 3, priority: 'medium' },
  { id: 'R7', annexZone: 'recovery', longitude: -58.358059, latitude: -34.867790, currentUrbanClusterAreaHa: 0.591, currentUrbanFeatureCount: 21, priority: 'medium' },
  { id: 'U3', annexZone: 'specific_use', longitude: -58.360745, latitude: -34.840314, currentUrbanClusterAreaHa: 0.623, currentUrbanFeatureCount: 20, priority: 'medium' },
];

function xyz(lon: number, lat: number, z: number) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n);
  return { x, y, z };
}

function releaseDate(item: WaybackConfigItem): string | null {
  const explicit = item.releaseDateLabel;
  if (explicit && /^20\d\d-\d\d-\d\d$/.test(explicit)) return explicit;
  const m = (item.itemTitle ?? '').match(/(20\d\d-\d\d-\d\d)/);
  return m?.[1] ?? null;
}

function tileUrl(item: WaybackConfigItem, releaseNum: string, z: number, y: number, x: number) {
  const template = item.itemURL || item.layerURL ||
    `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/${releaseNum}/{level}/{row}/{col}`;
  return template
    .replace('waybackdev.', 'wayback.')
    .replace('{level}', String(z)).replace('{row}', String(y)).replace('{col}', String(x))
    .replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x));
}

async function metadata(item: WaybackConfigItem, p: AuditPoint) {
  const base = item.metadataLayerUrl;
  if (!base) return null;
  const params = new URLSearchParams({
    f: 'json', where: '1=1', outFields: 'SRC_DATE2,NICE_DESC,SRC_DESC,SAMP_RES,SRC_ACC',
    geometry: JSON.stringify({ spatialReference: { wkid: 4326 }, x: p.longitude, y: p.latitude }),
    returnGeometry: 'false', geometryType: 'esriGeometryPoint', spatialRel: 'esriSpatialRelIntersects',
  });
  const r = await fetch(`${base}/${23 - ZOOM}/query?${params.toString()}`);
  if (!r.ok) return { httpStatus: r.status };
  const j = await r.json() as MetadataResponse;
  if (j.error) return { error: j.error };
  return j.features?.[0]?.attributes ?? null;
}

function quarterlySample<T extends { date: string }>(rows: T[]) {
  const byQuarter = new Map<string, T>();
  for (const row of rows) {
    const month = Number(row.date.slice(5, 7));
    const quarter = Math.floor((month - 1) / 3) + 1;
    byQuarter.set(`${row.date.slice(0, 4)}-Q${quarter}`, row); // keep latest release in each quarter
  }
  return [...byQuarter.values()].sort((a, b) => a.date.localeCompare(b.date));
}

describe('Wayback screening of current urban cadastral clusters inside Annex-I exception zones', () => {
  it('archives a quarterly 2018-2026 timeline without equating current Urban type with post-2020 development', async () => {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const cr = await fetch(CONFIG_URL);
    expect(cr.ok).toBe(true);
    const config = await cr.json() as Record<string, WaybackConfigItem>;
    const allReleases = Object.entries(config)
      .map(([releaseNum, item]) => ({ releaseNum, item, date: releaseDate(item) }))
      .filter((r): r is { releaseNum: string; item: WaybackConfigItem; date: string } => Boolean(r.date))
      .filter((r) => r.date >= '2018-01-01' && r.date <= '2026-12-31')
      .sort((a, b) => a.date.localeCompare(b.date));
    const releases = quarterlySample(allReleases);

    const pointReports = [];
    for (const p of POINTS) {
      const dir = path.join(OUTPUT_DIR, p.id);
      fs.mkdirSync(dir, { recursive: true });
      const tile = xyz(p.longitude, p.latitude, ZOOM);
      const seen = new Map<string, { releaseNum: string; releaseDate: string; item: WaybackConfigItem; file: string; bytes: number }>();
      const timeline = [];

      for (const rel of releases) {
        const tr = await fetch(tileUrl(rel.item, rel.releaseNum, tile.z, tile.y, tile.x));
        if (!tr.ok) continue;
        const buf = Buffer.from(await tr.arrayBuffer());
        const hash = createHash('sha256').update(buf).digest('hex');
        timeline.push({ releaseNum: rel.releaseNum, releaseDate: rel.date, hash, bytes: buf.length });
        if (!seen.has(hash)) {
          const file = `${rel.date}_${rel.releaseNum}_z${ZOOM}_${tile.x}_${tile.y}.jpg`;
          fs.writeFileSync(path.join(dir, file), buf);
          seen.set(hash, { releaseNum: rel.releaseNum, releaseDate: rel.date, item: rel.item, file, bytes: buf.length });
        }
      }

      const distinct = [];
      for (const [hash, first] of seen.entries()) {
        distinct.push({
          hash,
          firstReleaseNum: first.releaseNum,
          firstReleaseDate: first.releaseDate,
          file: first.file,
          bytes: first.bytes,
          metadata: await metadata(first.item, p),
        });
      }
      pointReports.push({ ...p, tile, releasesSampled: releases.length, tilesFetched: timeline.length, distinctTileImages: distinct.length, distinct, timeline });
    }

    const report = {
      source: 'Esri World Imagery Wayback; screening points derived from current GeoARBA Urban clusters registered to Ordenanza 11.819/20 Annex I',
      zoom: ZOOM,
      allReleasesAvailable: allReleases.length,
      quarterlyReleasesSampled: releases.length,
      points: pointReports,
      caution: [
        'A current GeoARBA feature typed Urbano is a cadastral screening signal, not proof of sale, construction or a post-2020 change.',
        'The point is a cluster centroid, not a development boundary.',
        'Wayback release date is not acquisition date; SRC_DATE2 metadata is preferred when available.',
        'Visual comparison is required before classifying a cluster as pre-existing, transformed after 2020, or indeterminate.',
      ],
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(report, null, 2));
    console.log('EXCEPTION_ZONES_WAYBACK_PROBE_BEGIN');
    console.log(JSON.stringify(report, null, 2));
    console.log('EXCEPTION_ZONES_WAYBACK_PROBE_END');

    expect(releases.length).toBeGreaterThan(20);
    expect(pointReports.every((row) => row.tilesFetched > 0)).toBe(true);
  }, 240_000);
});
