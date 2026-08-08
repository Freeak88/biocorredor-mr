import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase';
import { getLocalMedia, updateLocalMedia, type LocalMediaEvidence } from './mediaEvidence';
import { newLocalId } from './localIds';

export type SyncState = 'local_only' | 'queued' | 'syncing' | 'synced' | 'retry' | 'conflict' | 'failed';
export type SyncEntityType = 'survey_event' | 'occurrence' | 'territorial_change' | 'media_evidence';

export interface SyncIdentity {
  local_id: string;
  device_id: string;
  sync_key: string;
  server_id: string | null;
  sync_status: SyncState;
  retry_count: number;
  last_sync_error: string | null;
  last_sync_at: string | null;
  remote_updated_at: string | null;
  last_synced_remote_updated_at: string | null;
}

export interface SyncEntity extends SyncIdentity {
  data: Record<string, any>;
  local_updated_at: string;
  conflict_local_snapshot?: Record<string, any> | null;
  conflict_remote_snapshot?: Record<string, any> | null;
  conflict_detected_at?: string | null;
}

export interface SyncMedia extends SyncEntity {
  media: LocalMediaEvidence;
}

export interface SyncDataset {
  event: SyncEntity;
  occurrences: SyncEntity[];
  territorial_changes: SyncEntity[];
  media: SyncMedia[];
}

export interface SyncQueueItem {
  id: string;
  entity_type: SyncEntityType;
  local_id: string;
  operation: 'upsert';
  dataset: SyncDataset;
  attempts: number;
  created_at: string;
  last_attempt_at: string | null;
  last_error: string | null;
}

export interface SyncSummary {
  pending: number;
  synced: number;
  conflicts: number;
  errors: number;
  conflict_details?: Array<{ entity_type: SyncEntityType; local_id: string; local: Record<string, any>; remote: Record<string, any>; detected_at: string }>;
}

const DEVICE_KEY = 'biocorredor_device_id';
const DB_NAME = 'biocorredor-remote-sync';
const DB_VERSION = 2;
const STORE = 'sync_queue';
const ENTITY_STORE = 'sync_entities';

function apiBaseUrl(): string {
  return typeof window !== 'undefined' && (window as Window & { __PB_API_URL__?: string }).__PB_API_URL__
    ? (window as Window & { __PB_API_URL__?: string }).__PB_API_URL__!
    : typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8090';
}

export function createSyncClient(baseUrl = apiBaseUrl()): PocketBase {
  const client = new PocketBase(baseUrl);
  client.autoCancellation(false);
  return client;
}

export function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const deviceId = `MRPHONE-${newLocalId('device').replace(/[^a-zA-Z0-9-]/g, '').slice(-20)}`;
  localStorage.setItem(DEVICE_KEY, deviceId);
  return deviceId;
}

export function makeSyncKey(deviceId: string, entityType: SyncEntityType, localId: string): string {
  return `${deviceId}:${entityType}:${localId}`;
}

export function createSyncIdentity(entityType: SyncEntityType, localId = newLocalId(entityType)): SyncIdentity {
  const deviceId = getDeviceId();
  return {
    local_id: localId, device_id: deviceId, sync_key: makeSyncKey(deviceId, entityType, localId), server_id: null,
    sync_status: 'local_only', retry_count: 0, last_sync_error: null, last_sync_at: null,
    remote_updated_at: null, last_synced_remote_updated_at: null,
  };
}

export function serializeSurveyEvent(input: { identity: SyncIdentity; eventId: string; title: string; projectId: string; siteId?: string | null; protocolId?: string | null; createdBy: string; startedAt: string; methodology: Record<string, any> }): Record<string, any> {
  return {
    ...input.methodology, event_id: input.eventId, title: input.title, project: input.projectId, site: input.siteId || undefined,
    protocol: input.protocolId || undefined, created_by: input.createdBy, started_at: input.startedAt,
    local_id: input.identity.local_id, device_id: input.identity.device_id, sync_key: input.identity.sync_key,
    server_id: input.identity.server_id || undefined, sync_status: input.identity.sync_status, retry_count: input.identity.retry_count,
  };
}

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB no está disponible para la cola remota.')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
      if (!request.result.objectStoreNames.contains(ENTITY_STORE)) request.result.createObjectStore(ENTITY_STORE, { keyPath: 'sync_key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir la cola remota.'));
  });
}

async function queuePut(item: SyncQueueItem): Promise<void> {
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(item); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
}

async function entityPut(entity: SyncEntity): Promise<void> {
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(ENTITY_STORE, 'readwrite'); tx.objectStore(ENTITY_STORE).put(entity); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
}

export async function listLocalSyncEntities(): Promise<SyncEntity[]> {
  const db = await openQueueDb();
  const items = await new Promise<SyncEntity[]>((resolve, reject) => { const req = db.transaction(ENTITY_STORE, 'readonly').objectStore(ENTITY_STORE).getAll(); req.onsuccess = () => resolve(req.result as SyncEntity[]); req.onerror = () => reject(req.error); });
  db.close();
  return items;
}

async function persistDatasetEntities(dataset: SyncDataset): Promise<void> {
  await Promise.all([entityPut(dataset.event), ...dataset.occurrences.map(entityPut), ...dataset.territorial_changes.map(entityPut)]);
}

export async function enqueueSyncDataset(dataset: SyncDataset): Promise<SyncQueueItem> {
  const item: SyncQueueItem = {
    id: newLocalId('sync'), entity_type: 'survey_event', local_id: dataset.event.local_id, operation: 'upsert', dataset,
    attempts: 0, created_at: new Date().toISOString(), last_attempt_at: null, last_error: null,
  };
  await persistDatasetEntities(dataset);
  await queuePut(item);
  return item;
}

export async function listSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await openQueueDb();
  const items = await new Promise<SyncQueueItem[]>((resolve, reject) => { const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll(); req.onsuccess = () => resolve(req.result as SyncQueueItem[]); req.onerror = () => reject(req.error); });
  db.close();
  return items.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

async function queueDelete(id: string): Promise<void> {
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
}

function quote(value: string): string { return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
function statusOf(error: unknown): number | undefined { return error instanceof ClientResponseError ? error.status : (error as { status?: number })?.status; }
function isAuthError(error: unknown): boolean { return statusOf(error) === 401 || statusOf(error) === 403; }
function isTemporary(error: unknown): boolean { const status = statusOf(error); return !status || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500; }

async function findBySyncKey(client: PocketBase, collection: string, syncKey: string): Promise<RecordModel | null> {
  try { return await client.collection(collection).getFirstListItem(`sync_key = "${quote(syncKey)}"`); } catch (error) { if (statusOf(error) === 404) return null; throw error; }
}

async function findByField(client: PocketBase, collection: string, field: string, value: string): Promise<RecordModel | null> {
  try { return await client.collection(collection).getFirstListItem(`${field} = "${quote(value)}"`); } catch (error) { if (statusOf(error) === 404) return null; throw error; }
}

function conflictRequired(local: SyncEntity, remote: RecordModel): boolean {
  if (!local.last_synced_remote_updated_at || !local.local_updated_at) return false;
  const remoteTime = Date.parse(String(remote.updated || remote.remote_updated_at || remote.last_sync_at || ''));
  return remoteTime > Date.parse(local.last_synced_remote_updated_at) && Date.parse(local.local_updated_at) > Date.parse(local.last_synced_remote_updated_at);
}

async function upsertEntity(client: PocketBase, collection: string, entity: SyncEntity): Promise<{ record: RecordModel; conflict?: Record<string, any> }> {
  const existing = await findBySyncKey(client, collection, entity.sync_key);
  if (existing && conflictRequired(entity, existing)) return { record: existing, conflict: { local: entity.data, remote: existing, detected_at: new Date().toISOString() } };
  if (existing) return { record: existing };
  try {
    const created = await client.collection(collection).create({ ...entity.data, sync_key: entity.sync_key, local_id: entity.local_id, device_id: entity.device_id, sync_status: 'synced' });
    const record = await client.collection(collection).update(created.id, { server_id: created.id, remote_updated_at: created.updated, last_synced_remote_updated_at: created.updated, sync_status: 'synced', last_sync_at: new Date().toISOString() });
    return { record };
  }
  catch (error) {
    if (statusOf(error) !== 400 && statusOf(error) !== 409) throw error;
    const collided = await findBySyncKey(client, collection, entity.sync_key);
    if (!collided) throw error;
    return { record: collided };
  }
}

async function verifyRemoteFile(client: PocketBase, record: RecordModel, media: LocalMediaEvidence): Promise<string> {
  const filename = record.original_file;
  if (!filename) throw new Error(`Media ${media.media_id} no tiene archivo remoto.`);
  const url = client.files.getURL(record, filename);
  const response = await fetch(url, { headers: client.authStore.token ? { Authorization: client.authStore.token } : undefined });
  if (!response.ok) throw new Error(`No se pudo recuperar media ${media.media_id}: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== media.file_size) throw new Error(`Tamaño remoto inconsistente para ${media.media_id}.`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (media.sha256 && hash !== media.sha256) throw new Error(`SHA-256 remoto no coincide para ${media.media_id}.`);
  return hash;
}

async function syncMedia(client: PocketBase, mediaEntity: SyncMedia, parent: { collection: 'occurrence' | 'territorial_change'; id: string }): Promise<void> {
  const media = await getLocalMedia(mediaEntity.media.media_id);
  if (!media) throw new Error(`Falta Blob local ${mediaEntity.media.media_id}.`);
  const existing = await findBySyncKey(client, 'media_evidence', mediaEntity.sync_key);
  let remote: RecordModel;
  if (existing) remote = existing;
  else {
    const formData = new FormData();
    formData.append(parent.collection, parent.id); formData.append('original_file', new File([media.blob], `${media.media_id}.original`, { type: media.mime_type }));
    formData.append('sha256', media.sha256 || ''); formData.append('mime_type', media.mime_type); formData.append('file_size', String(media.file_size));
    formData.append('captured_at', media.captured_at); formData.append('ingested_at', media.ingested_at); formData.append('media_type', 'photo');
    formData.append('media_role', media.media_role); formData.append('is_original', 'true'); formData.append('sync_status', 'synced'); formData.append('created_by', mediaEntity.data.created_by);
    formData.append('media_id', media.media_id); formData.append('local_id', mediaEntity.local_id); formData.append('device_id', mediaEntity.device_id); formData.append('sync_key', mediaEntity.sync_key);
    remote = await client.collection('media_evidence').create(formData);
  }
  remote = await client.collection('media_evidence').update(remote.id, { server_id: remote.id, remote_updated_at: new Date().toISOString(), last_synced_remote_updated_at: new Date().toISOString(), sync_status: 'synced', last_sync_at: new Date().toISOString() });
  await verifyRemoteFile(client, remote, media);
  await updateLocalMedia(media.media_id, { server_id: remote.id, sync_status: 'synced', last_sync_error: null, retry_count: media.retry_count, last_sync_at: new Date().toISOString() } as Partial<LocalMediaEvidence>);
}

export async function syncDataset(dataset: SyncDataset, client = createSyncClient()): Promise<SyncSummary> {
  const result: SyncSummary = { pending: 0, synced: 0, conflicts: 0, errors: 0, conflict_details: [] };
  const knownEvent = dataset.event.data.event_id ? await findByField(client, 'survey_events', 'event_id', dataset.event.data.event_id) : null;
  const event = knownEvent ? { record: knownEvent } : await upsertEntity(client, 'survey_events', dataset.event);
  if (event.conflict) { result.conflicts++; const conflict = event.conflict as { local: Record<string, any>; remote: Record<string, any>; detected_at: string }; result.conflict_details!.push({ entity_type: 'survey_event', local_id: dataset.event.local_id, ...conflict }); return result; }
  const parentId = event.record.id;
  for (const entity of dataset.occurrences) {
    const resolved = await upsertEntity(client, 'occurrences', { ...entity, data: { ...entity.data, event: parentId } });
    if (resolved.conflict) { result.conflicts++; const conflict = resolved.conflict as { local: Record<string, any>; remote: Record<string, any>; detected_at: string }; result.conflict_details!.push({ entity_type: 'occurrence', local_id: entity.local_id, ...conflict }); continue; }
    for (const media of dataset.media.filter((item) => item.media.parent_type === 'occurrence' && item.media.parent_local_id === entity.local_id)) await syncMedia(client, media, { collection: 'occurrence', id: resolved.record.id });
    result.synced++;
  }
  for (const entity of dataset.territorial_changes) {
    const resolved = await upsertEntity(client, 'territorial_changes', { ...entity, data: { ...entity.data, event: parentId } });
    if (resolved.conflict) { result.conflicts++; const conflict = resolved.conflict as { local: Record<string, any>; remote: Record<string, any>; detected_at: string }; result.conflict_details!.push({ entity_type: 'territorial_change', local_id: entity.local_id, ...conflict }); continue; }
    for (const media of dataset.media.filter((item) => item.media.parent_type === 'territorial_change' && item.media.parent_local_id === entity.local_id)) await syncMedia(client, media, { collection: 'territorial_change', id: resolved.record.id });
    result.synced++;
  }
  for (const media of dataset.media.filter((item) => item.media.parent_type === 'paper_record_reference')) await syncMedia(client, media, { collection: 'occurrence', id: parentId });
  result.synced++;
  return result;
}

export async function syncQueued(client = createSyncClient()): Promise<SyncSummary> {
  const queue = await listSyncQueue();
  const summary: SyncSummary = { pending: queue.length, synced: 0, conflicts: 0, errors: 0, conflict_details: [] };
  for (const item of queue) {
    item.attempts += 1; item.last_attempt_at = new Date().toISOString();
    try {
      const result = await syncDataset(item.dataset, client); summary.synced += result.synced; summary.conflicts += result.conflicts;
      const state: SyncState = result.conflicts ? 'conflict' : 'synced';
      const conflictFor = (entity: SyncEntity) => result.conflict_details?.find((detail) => detail.local_id === entity.local_id);
      const updateLocal = (entity: SyncEntity) => { const conflict = conflictFor(entity); return entityPut({ ...entity, sync_status: state, last_sync_at: new Date().toISOString(), last_sync_error: result.conflicts ? 'Conflicto de sincronización' : null, conflict_local_snapshot: conflict?.local || null, conflict_remote_snapshot: conflict?.remote || null, conflict_detected_at: conflict?.detected_at || null }); };
      await Promise.all([updateLocal(item.dataset.event), ...item.dataset.occurrences.map(updateLocal), ...item.dataset.territorial_changes.map(updateLocal)]);
      if (result.conflicts) { item.last_error = 'Conflicto de sincronización'; await queuePut(item); continue; }
      await queueDelete(item.id);
    } catch (error) {
      item.last_error = error instanceof Error ? error.message : String(error); summary.errors++;
      const state: SyncState = isAuthError(error) || !isTemporary(error) ? 'failed' : 'retry';
      await Promise.all([entityPut({ ...item.dataset.event, sync_status: state, retry_count: item.attempts, last_sync_error: item.last_error, last_sync_at: new Date().toISOString() }), ...item.dataset.occurrences.map((entity) => entityPut({ ...entity, sync_status: state, retry_count: item.attempts, last_sync_error: item.last_error, last_sync_at: new Date().toISOString() })), ...item.dataset.territorial_changes.map((entity) => entityPut({ ...entity, sync_status: state, retry_count: item.attempts, last_sync_error: item.last_error, last_sync_at: new Date().toISOString() }))]);
      await queuePut(item);
    }
  }
  return summary;
}

export function classifySyncError(error: unknown): 'auth' | 'retry' | 'failed' {
  if (isAuthError(error)) return 'auth';
  return isTemporary(error) ? 'retry' : 'failed';
}
