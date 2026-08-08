import { useCallback, useEffect, useState } from 'react';
import { pb } from '../lib/pb';
import { getCanonicalSyncStatus, notifySyncStatusChanged, type CanonicalSyncStatus } from '../lib/remoteSync';

const initialStatus: CanonicalSyncStatus = {
  pending_count: 0, synced_count: 0, conflict_count: 0, error_count: 0,
  last_successful_sync_at: null, network_available: typeof navigator === 'undefined' ? true : navigator.onLine,
  backend_reachable: null, sync_pending: false, sync_error: false, state: 'NEVER_SYNCED',
};

export function useSyncStatus(enabled = true) {
  const [status, setStatus] = useState<CanonicalSyncStatus>(initialStatus);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const networkAvailable = typeof navigator === 'undefined' ? true : navigator.onLine;
    let backendReachable: boolean | null = null;
    if (networkAvailable) {
      try { await pb.health.check(); backendReachable = true; }
      catch { backendReachable = false; }
    }
    try { setStatus(await getCanonicalSyncStatus({ backendReachable })); }
    catch { setStatus((current) => ({ ...current, network_available: networkAvailable, backend_reachable: backendReachable, state: networkAvailable ? 'ERROR' : 'OFFLINE', sync_error: true })); }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const onConnectivity = () => void refresh();
    const onSyncChanged = () => void refresh();
    window.addEventListener('online', onConnectivity);
    window.addEventListener('offline', onConnectivity);
    window.addEventListener('biocorredor:sync-changed', onSyncChanged);
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => {
      window.removeEventListener('online', onConnectivity); window.removeEventListener('offline', onConnectivity);
      window.removeEventListener('biocorredor:sync-changed', onSyncChanged); window.clearInterval(interval);
    };
  }, [enabled, refresh]);

  return { status, refresh, notifySyncStatusChanged };
}

export function syncStatusLabel(status: CanonicalSyncStatus): string {
  switch (status.state) {
    case 'ONLINE_SYNCED': return 'Sincronizado';
    case 'ONLINE_PENDING': return `Pendiente de sincronización${status.pending_count ? ` · ${status.pending_count}` : ''}`;
    case 'OFFLINE': return 'Sin conexión';
    case 'BACKEND_UNAVAILABLE': return 'Servidor no disponible';
    case 'ERROR': return 'Requiere atención';
    default: return 'Aún no sincronizado';
  }
}

