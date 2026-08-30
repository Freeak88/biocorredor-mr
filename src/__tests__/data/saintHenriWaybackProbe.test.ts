import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

type WaybackConfigItem = {
  itemTitle?: string;
  itemURL?: string;
  layerURL?: string;
  metadataLayerUrl?: string;
  layerIdentifier?: string;
  releaseDateLabel?: string;
};

type MetadataResponse = {
  features?: Array<{ attributes?: Record<string, unknown> }>;
};

const CONFIG_URL = 'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json';
const POINT = { longitude: -58.34472222, latitude: -34.8625 };
const ZOOM = 17;

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
  const title = item.itemTitle ?? '';
  const m = title.match(/(20\d\d-\d\d-\d\d)/);
  return m?.[1] ?? null;
}

function tileUrl(item: WaybackConfigItem, releaseNum: string, z: number, y: number, x: number) {
  const template = item.itemURL || item.layerURL ||
    `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/${releaseNum}/{level}/{row}/{col}`;
  return template
    .replace('waybackdev.', 'wayback.')
    .replace('{level}', String(z))
    .replace('{row}', String(y))
    .replace('{col}', String(x))
    .replace('{z}', String(z))
    .replace('{y}', String(y))
    .replace('{x}', String(x));
}

async function metadata(item: WaybackConfigItem, releaseNum: string) {
  const base = item.metadataLayerUrl;
  if (!base) return null;
  const layerId = 23 - ZOOM;
  const geometry = JSON.stringify({
    spatialReference: { wkid: 4326 },
    x: POINT.longitude,
    y: POINT.latitude,
  });
  const params = new URLSearchParams({
    f: 'json', where: '1=1',
    outFields: 'SRC_DATE2,SRC_DATE,SRC_PROV,SRC_PROVIDER,SRC_NAME,SRC_ACC,SRC_RES',
    geometry,
    returnGeometry: 'false',
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
  });
  const r = await fetch(`${base}/${layerId}/query?${params.toString()}`);
  if (!r.ok) return { httpStatus: r.status };
  const j = await r.json() as MetadataResponse;
  return j.features?.[0]?.attributes ?? null;
}

describe('Saint Henri Wayback evidence probe', () => {
  it('finds historical imagery changes at the aerodrome reference point', async () => {
    const r = await fetch(CONFIG_URL);
    expect(r.ok).toBe(true);
    const config = await r.json() as Record<string, WaybackConfigItem>;
    const releases = Object.entries(config)
      .map(([releaseNum, item]) => ({ releaseNum, item, date: releaseDate(item) }))
      .filter((r): r is { releaseNum: string; item: WaybackConfigItem; date: string } => Boolean(r.date))
      .filter((r) => r.date >= '2018-01-01' && r.date <= '2026-12-31')
      .sort((a, b) => a.date.localeCompare(b.date));

    const tile = xyz(POINT.longitude, POINT.latitude, ZOOM);
    const seen = new Map<string, { releaseNum: string; date: string; item: WaybackConfigItem; bytes: number }>();
    const timeline: Array<{ releaseNum: string; releaseDate: string; hash: string; bytes: number }> = [];

    for (const rel of releases) {
      const u = tileUrl(rel.item, rel.releaseNum, tile.z, tile.y, tile.x);
      const tr = await fetch(u);
      if (!tr.ok) continue;
      const buf = Buffer.from(await tr.arrayBuffer());
      const hash = createHash('sha256').update(buf).digest('hex');
      timeline.push({ releaseNum: rel.releaseNum, releaseDate: rel.date, hash, bytes: buf.length });
      if (!seen.has(hash)) seen.set(hash, { releaseNum: rel.releaseNum, date: rel.date, item: rel.item, bytes: buf.length });
    }

    const unique = [];
    for (const [hash, first] of seen.entries()) {
      unique.push({
        hash,
        firstReleaseNum: first.releaseNum,
        firstReleaseDate: first.date,
        bytes: first.bytes,
        layerIdentifier: first.item.layerIdentifier ?? null,
        metadata: await metadata(first.item, first.releaseNum),
      });
    }

    console.log('SAINT_HENRI_WAYBACK_PROBE_BEGIN');
    console.log(JSON.stringify({
      point: POINT,
      zoom: ZOOM,
      tile,
      releasesChecked: releases.length,
      tilesFetched: timeline.length,
      distinctTileImages: unique.length,
      unique,
      releaseTimeline: timeline,
      caution: 'Wayback release date is not imagery acquisition date. Metadata is authoritative for acquisition date when present. A single tile is a change detector, not the development boundary.',
    }, null, 2));
    console.log('SAINT_HENRI_WAYBACK_PROBE_END');

    expect(releases.length).toBeGreaterThan(0);
    expect(timeline.length).toBeGreaterThan(0);
  }, 60_000);
});
