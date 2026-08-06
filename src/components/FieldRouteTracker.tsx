import { useEffect } from 'react';
import { drainQueue, isOnline, onOnlineChange, removeQueuedOps } from '../lib/offline';
import { recordRoutePoint, resetRouteTracking, syncRoutePoints } from '../services/routeTracking';
import type { AuthUser } from '../hooks/useAuth';

const PILOT_EVENT_ID = '2hp2demnto50j73';

type JourneyState = { status: 'ready' | 'active' | 'closed' };

function isJourneyActive(uid: string): boolean {
  try {
    const state = JSON.parse(localStorage.getItem(`biocorredor_journey_${uid}`) || '{}') as JourneyState;
    return state.status === 'active';
  } catch {
    return false;
  }
}

export default function FieldRouteTracker({ user }: { user: AuthUser }) {
  useEffect(() => {
    let watchId: number | null = null;
    let active = false;

    const stop = () => {
      if (watchId !== null) navigator.geolocation?.clearWatch(watchId);
      watchId = null;
      active = false;
      resetRouteTracking();
    };

    const startOrStop = () => {
      const shouldTrack = Boolean(navigator.geolocation) && isJourneyActive(user.uid);
      if (shouldTrack && !active) {
        watchId = navigator.geolocation.watchPosition(
          (position) => { void recordRoutePoint(PILOT_EVENT_ID, user.uid, position); },
          () => {},
          { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
        );
        active = true;
      } else if (!shouldTrack && active) {
        stop();
      }
    };

    const syncRoutes = async () => {
      if (!isOnline()) return;
      const ops = await drainQueue();
      const routeOps = ops.filter((op) => op.type === 'route-point');
      if (!routeOps.length) return;
      await syncRoutePoints(routeOps);
      await removeQueuedOps(routeOps.map((op) => op.id));
    };

    startOrStop();
    const statePoll = window.setInterval(startOrStop, 1000);
    const unsubscribe = onOnlineChange((online) => { if (online) void syncRoutes().catch(() => {}); });
    void syncRoutes().catch(() => {});
    return () => { window.clearInterval(statePoll); unsubscribe(); stop(); };
  }, [user.uid]);

  return null;
}
