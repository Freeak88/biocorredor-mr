import { enqueueOp, type QueuedOp } from '../lib/offline';
import { pb } from '../lib/pb';
import { newLocalId } from '../lib/localIds';

export type RoutePoint = {
  event: string;
  observer: string;
  route_point_id: string;
  latitude: number;
  longitude: number;
  accuracy_m?: number;
  recorded_at: string;
  source: 'gps';
  sequence: number;
};

let lastPoint: { lat: number; lng: number; at: number } | null = null;
let sequence = 0;

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const lat = ((a.lat + b.lat) / 2) * Math.PI / 180;
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos(lat);
  return Math.sqrt(dLat ** 2 + dLng ** 2);
}

export async function recordRoutePoint(event: string, observer: string, position: GeolocationPosition): Promise<boolean> {
  const now = Date.now();
  const current = { lat: position.coords.latitude, lng: position.coords.longitude };
  if (lastPoint && now - lastPoint.at < 30_000 && distanceMeters(lastPoint, current) < 15) return false;
  lastPoint = { ...current, at: now };
  const point: RoutePoint = {
    event, observer, route_point_id: newLocalId('route'),
    latitude: current.lat, longitude: current.lng, accuracy_m: position.coords.accuracy,
    recorded_at: new Date(now).toISOString(), source: 'gps', sequence: sequence++,
  };
  await enqueueOp('route-point', { routePoint: point });
  return true;
}

export async function syncRoutePoints(ops: QueuedOp[]): Promise<void> {
  for (const op of ops) {
    if (op.type !== 'route-point') continue;
    const payload = op.payload as { routePoint: RoutePoint };
    try {
      await pb.collection('route_points').create(payload.routePoint);
    } catch (error: any) {
      if (error?.status !== 400 && error?.status !== 409) throw error;
      await pb.collection('route_points').getFirstListItem(`route_point_id = "${payload.routePoint.route_point_id}"`);
    }
  }
}

export function resetRouteTracking(): void {
  lastPoint = null;
  sequence = 0;
}
