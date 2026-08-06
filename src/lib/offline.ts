// Offline persistence and queue for field records.

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

export interface QueuedOp {
  id: string;
  type: string;
  payload: unknown;
  createdAt: number;
}

const QUEUE_KEY = 'biocorredor_offline_queue';
const DB_NAME = 'biocorredor-mr';
const DB_VERSION = 1;
const STORE_NAME = 'operations';

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no está disponible en este dispositivo.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir la cola local.'));
  });
}

function getLegacyQueue(): QueuedOp[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function setLegacyQueue(queue: QueuedOp[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueOp(type: string, payload: unknown): Promise<string> {
  const id = `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const operation = { id, type, payload, createdAt: Date.now() };
  try {
    const db = await openQueueDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(operation);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    const queue = getLegacyQueue();
    queue.push(operation);
    setLegacyQueue(queue);
  }

  // Register background sync if available
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then((reg) => {
      (reg as any).sync?.register('sync-sightings').catch(() => {});
    });
  }

  return id;
}

export async function dequeueOp(id: string): Promise<void> {
  try {
    const db = await openQueueDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    setLegacyQueue(getLegacyQueue().filter((op) => op.id !== id));
  }
}

export async function drainQueue(): Promise<QueuedOp[]> {
  try {
    const db = await openQueueDb();
    const queue = await new Promise<QueuedOp[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as QueuedOp[]);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => {};
    });
    db.close();
    return queue;
  } catch {
    const queue = getLegacyQueue();
    return queue;
  }
}

export async function clearQueue(): Promise<void> {
  try {
    const db = await openQueueDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    setLegacyQueue([]);
  }
}

export async function getPendingCount(): Promise<number> {
  try {
    const db = await openQueueDb();
    const count = await new Promise<number>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return count;
  } catch {
    return getLegacyQueue().length;
  }
}

// ——— Auto-sync when coming back online ———

let syncHandler: ((ops: QueuedOp[]) => Promise<void>) | null = null;

export function registerSyncHandler(handler: (ops: QueuedOp[]) => Promise<void>): void {
  syncHandler = handler;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void drainQueue().then((queue) => {
      if (queue.length > 0 && syncHandler) {
        syncHandler(queue).then(() => clearQueue()).catch((err) => console.error('[Offline] Sync error:', err));
      }
    });
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        console.log('[Offline] Background sync complete');
      }
    });
  }
}
