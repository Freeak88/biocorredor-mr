import { newLocalId } from './localIds';

export type FallbackJourney = {
  id: string;
  title: string;
  protocol: string;
  site: string;
  participants: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'closed';
};

export type FallbackRecord = {
  id: string;
  journeyId: string;
  kind: 'occurrence' | 'territorial_change';
  observedAt: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  locationSource: 'gps' | 'missing';
  taxonGroup?: string;
  fieldName?: string;
  changeType?: string;
  objectiveDescription?: string;
  notes: string;
  mediaId?: string;
  createdAt: string;
};

export type FallbackMedia = {
  id: string;
  recordId: string;
  name: string;
  mimeType: string;
  size: number;
  capturedAt: string;
  ingestedAt: string;
  sha256: string;
  blob: Blob;
};

const DB_NAME = 'biocorredor-mr-fallback';
const DB_VERSION = 1;

function openFallbackDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB no está disponible en este navegador.')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('journeys')) db.createObjectStore('journeys', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir el fallback local.'));
  });
}

async function put(storeName: 'journeys' | 'records' | 'media', value: FallbackJourney | FallbackRecord | FallbackMedia): Promise<void> {
  const db = await openFallbackDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error || new Error('No se pudo guardar el registro local.'));
  });
  db.close();
}

async function list<T>(storeName: 'journeys' | 'records' | 'media'): Promise<T[]> {
  const db = await openFallbackDb();
  const values = await new Promise<T[]>((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]); request.onerror = () => reject(request.error || new Error('No se pudieron leer los datos locales.'));
  });
  db.close(); return values;
}

export async function createFallbackJourney(input: Pick<FallbackJourney, 'title' | 'protocol' | 'site' | 'participants'>): Promise<FallbackJourney> {
  const journey: FallbackJourney = { ...input, id: newLocalId('event'), startedAt: new Date().toISOString(), status: 'active' };
  await put('journeys', journey); return journey;
}

export async function closeFallbackJourney(journey: FallbackJourney): Promise<FallbackJourney> {
  const closed: FallbackJourney = { ...journey, endedAt: new Date().toISOString(), status: 'closed' };
  await put('journeys', closed); return closed;
}

export async function listFallbackJourneys(): Promise<FallbackJourney[]> { return list<FallbackJourney>('journeys'); }

export async function saveFallbackRecord(record: Omit<FallbackRecord, 'id' | 'createdAt'>, file?: File): Promise<{ record: FallbackRecord; media?: FallbackMedia }> {
  const saved: FallbackRecord = { ...record, id: newLocalId(record.kind === 'occurrence' ? 'occurrence' : 'change'), createdAt: new Date().toISOString() };
  let media: FallbackMedia | undefined;
  if (file) {
    const data = new Uint8Array(await file.arrayBuffer()); const digest = await crypto.subtle.digest('SHA-256', data);
    const sha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    media = { id: newLocalId('media'), recordId: saved.id, name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, capturedAt: new Date().toISOString(), ingestedAt: new Date().toISOString(), sha256, blob: file.slice(0, file.size, file.type) };
    saved.mediaId = media.id;
  }
  await put('records', saved); if (media) await put('media', media); return { record: saved, media };
}

export async function listFallbackRecords(): Promise<FallbackRecord[]> { return list<FallbackRecord>('records'); }
export async function listFallbackMedia(): Promise<FallbackMedia[]> { return list<FallbackMedia>('media'); }
