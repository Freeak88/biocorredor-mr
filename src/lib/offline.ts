// Offline persistence and queue — PocketBase version
// PocketBase SDK doesn't have built-in offline persistence like Firestore.
// This module provides online/offline detection and a localStorage-based operation queue.

// ——— Online/offline detection ———

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

type OnlineListener = (online: boolean) => void;

const listeners = new Set<OnlineListener>();

export function onOnlineChange(listener: OnlineListener): () => void {
  listeners.add(listener);
  const onlineHandler = () => listener(true);
  const offlineHandler = () => listener(false);
  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', offlineHandler);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('online', onlineHandler);
    window.removeEventListener('offline', offlineHandler);
  };
}

// ——— Offline operation queue ———

interface QueuedOp {
  id: string;
  type: string;
  payload: unknown;
  createdAt: number;
}

const QUEUE_KEY = 'fungimap_offline_queue';

function getQueue(): QueuedOp[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function setQueue(queue: QueuedOp[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueOp(type: string, payload: unknown): string {
  const queue = getQueue();
  const id = `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  queue.push({ id, type, payload, createdAt: Date.now() });
  setQueue(queue);

  // Register background sync if available
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then((reg) => {
      (reg as any).sync?.register('sync-sightings').catch(() => {});
    });
  }

  return id;
}

export function dequeueOp(id: string): void {
  const queue = getQueue().filter((op) => op.id !== id);
  setQueue(queue);
}

export function drainQueue(): QueuedOp[] {
  const queue = getQueue();
  setQueue([]);
  return queue;
}

export function getPendingCount(): number {
  return getQueue().length;
}

// ——— Auto-sync when coming back online ———

let syncHandler: ((ops: QueuedOp[]) => Promise<void>) | null = null;

export function registerSyncHandler(handler: (ops: QueuedOp[]) => Promise<void>): void {
  syncHandler = handler;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const queue = drainQueue();
    if (queue.length > 0 && syncHandler) {
      syncHandler(queue).catch((err) => console.error('[Offline] Sync error:', err));
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        console.log('[Offline] Background sync complete');
      }
    });
  }
}
