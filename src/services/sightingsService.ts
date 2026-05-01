import { pb, withAuthRefresh } from '../lib/pb';
import type { ViewportBounds } from '../hooks/useGeoQuery';

export const DEFAULT_VIEWPORT_LIMIT = 500;

export function buildViewportFilter(bounds: ViewportBounds): string {
  const south = bounds.southWest.lat;
  const north = bounds.northEast.lat;
  const west = bounds.southWest.lng;
  const east = bounds.northEast.lng;
  const latFilter = `lat >= ${south} && lat <= ${north}`;
  const lngFilter = west <= east
    ? `lng >= ${west} && lng <= ${east}`
    : `(lng >= ${west} || lng <= ${east})`;
  return `${latFilter} && ${lngFilter}`;
}

export function listSightingsInViewport(bounds: ViewportBounds, limit = DEFAULT_VIEWPORT_LIMIT) {
  return pb.collection('sightings').getList(1, limit, {
    sort: '-created',
    filter: buildViewportFilter(bounds),
    expand: 'user',
  });
}

export function createSighting(data: FormData) {
  return withAuthRefresh(() =>
    pb.collection('sightings').create(data, { requestKey: `sighting-create-${Date.now()}` })
  );
}

export function updateSighting(id: string, data: Record<string, unknown>) {
  return withAuthRefresh(() =>
    pb.collection('sightings').update(id, data, { requestKey: `sighting-update-${Date.now()}` })
  );
}
