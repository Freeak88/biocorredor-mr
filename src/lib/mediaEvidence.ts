export type MediaParentType = 'occurrence' | 'territorial_change' | 'paper_record_reference';
export type MediaRole = 'biological_evidence' | 'territorial_evidence' | 'paper_original' | 'habitat_context' | 'diagnostic_detail' | 'other';

export interface LocalMediaEvidence {
  media_id: string;
  parent_type: MediaParentType;
  parent_local_id: string;
  paper_id?: string | null;
  media_role: MediaRole;
  mime_type: string;
  file_size: number;
  captured_at: string;
  ingested_at: string;
  sha256: string | null;
  sync_status: 'local_only' | 'pending_hash' | 'syncing' | 'synced' | 'failed';
  local_id: string;
  server_id: string | null;
  retry_count: number;
  last_sync_error: string | null;
  blob: Blob;
}

const DB_NAME = 'biocorredor-media-evidence';
const DB_VERSION = 1;
const STORE = 'media';

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB no está disponible.')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'media_id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir el almacén de evidencia.'));
  });
}

async function putMedia(media: LocalMediaEvidence): Promise<void> {
  const db = await openMediaDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(media);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error || new Error('No se pudo persistir la evidencia.'));
  });
  db.close();
}

export async function getLocalMedia(mediaId: string): Promise<LocalMediaEvidence | undefined> {
  const db = await openMediaDb();
  const media = await new Promise<LocalMediaEvidence | undefined>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(mediaId);
    request.onsuccess = () => resolve(request.result as LocalMediaEvidence | undefined); request.onerror = () => reject(request.error);
  });
  db.close(); return media;
}

export async function listLocalMedia(): Promise<LocalMediaEvidence[]> {
  const db = await openMediaDb();
  const media = await new Promise<LocalMediaEvidence[]>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as LocalMediaEvidence[]); request.onerror = () => reject(request.error);
  });
  db.close(); return media;
}

async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function persistMediaEvidence(file: File, input: { mediaId: string; parentType: MediaParentType; parentLocalId: string; mediaRole: MediaRole; paperId?: string | null; capturedAt?: string }): Promise<LocalMediaEvidence> {
  const blob = file.slice(0, file.size, file.type || 'application/octet-stream');
  const now = new Date().toISOString();
  const media: LocalMediaEvidence = {
    media_id: input.mediaId, local_id: input.mediaId, parent_type: input.parentType, parent_local_id: input.parentLocalId, paper_id: input.paperId || null,
    media_role: input.mediaRole, mime_type: file.type || 'application/octet-stream', file_size: file.size,
    captured_at: input.capturedAt || now, ingested_at: now, sha256: null, sync_status: 'pending_hash', server_id: null,
    retry_count: 0, last_sync_error: null, blob,
  };
  try { media.sha256 = await sha256Blob(blob); media.sync_status = 'local_only'; }
  catch { media.last_sync_error = 'No se pudo calcular SHA-256'; }
  await putMedia(media);
  return media;
}

export async function updateLocalMedia(mediaId: string, patch: Partial<LocalMediaEvidence>): Promise<void> {
  const current = await getLocalMedia(mediaId); if (current) await putMedia({ ...current, ...patch });
}

export async function requestStoragePersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  try { return await navigator.storage.persist(); } catch { return false; }
}

export async function getStorageEstimate(): Promise<StorageEstimate | null> {
  if (!navigator.storage?.estimate) return null;
  try { return await navigator.storage.estimate(); } catch { return null; }
}
