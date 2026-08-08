import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const container = `biocorredor-pb-e2e-${process.pid}`;
const volume = `biocorredor_pb_e2e_${process.pid}`;
const port = 18091;
const api = `http://127.0.0.1:${port}`;
const image = 'biocorredor-pb-gate';
const password = 'GatePassword123!';

type Dataset = { event: any; occurrences: any[]; territorial_changes: any[]; media: any[] };

function docker(args: string[]): string { return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }).trim(); }

async function waitForHealth(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { if ((await fetch(`${api}/api/health`, { headers: { Connection: 'close' } })).ok) return; } catch { /* wait for PocketBase */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  throw new Error('PocketBase E2E no inició a tiempo.');
}

async function json(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(`${api}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Connection: 'close', ...(init?.headers || {}) } });
  if (!response.ok) throw new Error(`${init?.method || 'GET'} ${path}: HTTP ${response.status} ${await response.text()}`);
  return response.json();
}

async function auth(): Promise<{ token: string; user: any }> {
  return json('/api/collections/_superusers/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: 'dgate@example.test', password }) });
}

async function createSeeds(): Promise<{ token: string; project: any; protocol: any; site: any; user: any; stratum: any; samplingUnit: any }> {
  const session = await auth();
  const headers = { Authorization: session.token };
  const get = (collection: string) => json(`/api/collections/${collection}/records?perPage=1`, { headers });
  const project = (await get('projects')).items[0];
  const protocol = (await get('protocols')).items[0];
  const site = (await get('sites')).items[0];
  const user = (await get('users')).items[0];
  const stratum = await json('/api/collections/strata/records', { method: 'POST', headers, body: JSON.stringify({ project: project.id, code: 'MR-PAS', name: 'MR-PAS', status: 'active' }) });
  const samplingUnit = await json('/api/collections/sampling_units/records', { method: 'POST', headers, body: JSON.stringify({ project: project.id, stratum: stratum.id, code: 'MR-PAS-T01', name: 'MR-PAS-T01', status: 'active' }) });
  return { token: session.token, project, protocol, site, user, stratum, samplingUnit };
}

async function makeDataset(page: Page, seeds: Awaited<ReturnType<typeof createSeeds>>, suffix: string): Promise<Dataset> {
  return page.evaluate(async ({ project, protocol, site, user, stratum, samplingUnit, suffix: run }) => {
    const sync = await import('/src/lib/remoteSync.ts');
    const mediaLib = await import('/src/lib/mediaEvidence.ts');
    const now = new Date().toISOString();
    const eventIdentity = sync.createSyncIdentity('survey_event', `event-${run}`);
    const event = {
      ...eventIdentity, local_updated_at: now,
      data: sync.serializeSurveyEvent({ identity: eventIdentity, eventId: `OFFLINE-${run}`, title: `Jornada offline ${run}`, projectId: project.id, siteId: site.id, protocolId: protocol.id, createdBy: user.id, startedAt: now, methodology: {
        inventory_mode: 'standardized', sampling_design: 'stratified', sampling_method: 'transect', sampling_effort_value: 90, sampling_effort_unit: 'observer_minutes', sampling_effort_notes: '3 observadores × 30 min', stratum: stratum.id, sampling_unit: samplingUnit.id, status: 'active',
      } }),
    };
    const occurrences = ['MR-20260815-P017', 'MR-20260815-P018', 'MR-20260815-P019'].map((paperId, index) => {
      const identity = sync.createSyncIdentity('occurrence', `occ-${run}-${index + 1}`);
      return { ...identity, local_updated_at: now, data: { occurrence_id: identity.local_id, observer: user.id, observed_at: now, field_name: `Organismo ${index + 1}`, scientific_name: 'Registro pendiente', scientific_name_proposed: index === 0 ? 'Cortadera' : undefined, morphospecies_code: index === 0 ? 'MORFO-PL-001' : undefined, taxon_group: 'flora', quantity: index + 1, quantity_unit: 'individuals', count_method: 'estimated', occurrence_status: 'detected', identification_status: 'unidentified', sensitive_record: 'false', public_visibility: 'private', local_status: 'pending', paper_id: paperId, notes: `Observación ${index + 1}` } };
    });
    const territorial_changes = [1, 2].map((index) => {
      const identity = sync.createSyncIdentity('territorial_change', `change-${run}-${index}`);
      return { ...identity, local_updated_at: now, data: { change_id: identity.local_id, observer: user.id, observed_at: now, change_type: index === 1 ? 'clearing' : 'filling', objective_description: `Cambio territorial ${index}`, initial_severity: 'unknown', status: 'pending_review', public_visibility: 'private', notes: 'Registro objetivo de campo' } };
    });
    const media: any[] = [];
    const definitions = [
      { parent: occurrences[0], parentType: 'occurrence', role: 'biological_evidence' },
      { parent: occurrences[1], parentType: 'occurrence', role: 'habitat_context' },
      { parent: occurrences[1], parentType: 'occurrence', role: 'diagnostic_detail' },
      { parent: occurrences[2], parentType: 'occurrence', role: 'paper_original' },
      { parent: territorial_changes[0], parentType: 'territorial_change', role: 'territorial_evidence' },
      { parent: territorial_changes[1], parentType: 'territorial_change', role: 'territorial_evidence' },
    ];
    for (let index = 0; index < definitions.length; index += 1) {
      const definition = definitions[index];
      const bytes = new Uint8Array([run.length, index, 66, 73, 79, 77, 82]);
      const file = new File([bytes], `${run}-${index}.bin`, { type: 'image/png' });
      const local = await mediaLib.persistMediaEvidence(file, { mediaId: `media-${run}-${index + 1}`, parentType: definition.parentType as 'occurrence' | 'territorial_change', parentLocalId: definition.parent.local_id, mediaRole: definition.role as any, paperId: definition.role === 'paper_original' ? definition.parent.data.paper_id : null });
      const identity = sync.createSyncIdentity('media_evidence', local.local_id);
      media.push({ ...identity, local_updated_at: now, data: { created_by: user.id }, media: local });
    }
    await sync.enqueueSyncDataset({ event, occurrences, territorial_changes, media });
    return { event, occurrences, territorial_changes, media };
  }, { ...seeds, suffix });
}

async function counts(token: string): Promise<Record<string, number>> {
  const headers = { Authorization: token };
  const result: Record<string, number> = {};
  for (const collection of ['survey_events', 'occurrences', 'territorial_changes', 'media_evidence']) result[collection] = (await json(`/api/collections/${collection}/records?perPage=200&filter=${encodeURIComponent('sync_key != ""')}`, { headers })).totalItems;
  return result;
}

test.beforeAll(async () => {
  const migrations = resolve('pocketbase/pb_migrations');
  const hooks = resolve('pocketbase/pb_hooks');
  if (!existsSync(migrations) || !existsSync(hooks)) throw new Error('No se encontraron migraciones/hooks para el Docker E2E.');
  try { docker(['rm', '-f', container]); } catch { /* disposable container did not exist */ }
  try { docker(['volume', 'rm', volume]); } catch { /* disposable volume did not exist */ }
  docker(['volume', 'create', volume]);
  docker(['run', '-d', '--name', container, '-p', `${port}:8090`, '-v', `${volume}:/pb/pb_data`, '-v', `${migrations}:/pb/pb_migrations`, '-v', `${hooks}:/pb/pb_hooks`, image]);
  await waitForHealth();
  docker(['exec', container, '/pb/pocketbase', 'superuser', 'create', 'dgate@example.test', password]);
});

test('sincronización remota real: 1/3/2/6, reintento, idempotencia, media y conflicto', async ({ page }) => {
  const seeds = await createSeeds();
  await page.addInitScript((url) => { (window as Window & { __PB_API_URL__?: string }).__PB_API_URL__ = url; }, api);
  await page.goto('/');
  await page.evaluate((token) => import('/src/lib/remoteSync.ts').then(({ createSyncClient }) => { const client = createSyncClient(); client.authStore.save(token, { id: 'dgate-superuser' }); }), seeds.token);
  const dataset = await makeDataset(page, seeds, 'A');
  const first = await page.evaluate(async () => (await import('/src/lib/remoteSync.ts')).syncQueued((await import('/src/lib/remoteSync.ts')).createSyncClient()));
  expect(first.errors).toBe(0);
  expect(await counts(seeds.token)).toEqual({ survey_events: 1, occurrences: 3, territorial_changes: 2, media_evidence: 6 });
  for (let attempt = 0; attempt < 2; attempt += 1) await page.evaluate(async () => (await import('/src/lib/remoteSync.ts')).syncQueued((await import('/src/lib/remoteSync.ts')).createSyncClient()));
  expect(await counts(seeds.token)).toEqual({ survey_events: 1, occurrences: 3, territorial_changes: 2, media_evidence: 6 });

  const collision = await page.evaluate(async (input) => { const sync = await import('/src/lib/remoteSync.ts'); const client = sync.createSyncClient(); const result = await sync.syncDataset(input as any, client); return result; }, dataset);
  expect(collision.errors).toBe(0);
  expect(await counts(seeds.token)).toEqual({ survey_events: 1, occurrences: 3, territorial_changes: 2, media_evidence: 6 });

  const interrupted = await makeDataset(page, seeds, 'B');
  await page.route(`${api}/api/collections/media_evidence/records`, (route) => route.abort());
  const failed = await page.evaluate(async () => (await import('/src/lib/remoteSync.ts')).syncQueued((await import('/src/lib/remoteSync.ts')).createSyncClient()));
  expect(failed.errors).toBeGreaterThan(0);
  expect((await counts(seeds.token)).survey_events).toBe(2);
  await page.unroute(`${api}/api/collections/media_evidence/records`);
  const recovered = await page.evaluate(async () => (await import('/src/lib/remoteSync.ts')).syncQueued((await import('/src/lib/remoteSync.ts')).createSyncClient()));
  expect(recovered.errors).toBe(0);
  expect(await counts(seeds.token)).toEqual({ survey_events: 2, occurrences: 6, territorial_changes: 4, media_evidence: 12 });

  const conflict = await page.evaluate(async (input) => {
    const sync = await import('/src/lib/remoteSync.ts');
    const client = sync.createSyncClient();
    const headers = { Authorization: client.authStore.token };
    const remote = await fetch(`${input.api}/api/collections/occurrences/records?perPage=1&filter=${encodeURIComponent(`sync_key = "${input.dataset.occurrences[0].sync_key}"`)}`, { headers }).then((response) => response.json());
    const remoteRecord = remote.items[0];
    await fetch(`${input.api}/api/collections/occurrences/records/${remoteRecord.id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: 'Cambio remoto significativo' }) });
    const local = structuredClone(input.dataset.occurrences[0]);
    local.last_synced_remote_updated_at = new Date(Date.now() - 60_000).toISOString();
    local.local_updated_at = new Date().toISOString();
    local.data.notes = 'Cambio local pendiente';
    const conflictDataset = { ...input.dataset, occurrences: [local] };
    await sync.enqueueSyncDataset(conflictDataset as any);
    const result = await sync.syncQueued(client);
    return { result, remoteRecord, local, localEntities: await sync.listLocalSyncEntities() };
  }, { api, dataset });
  expect(conflict.result.conflicts).toBeGreaterThan(0);
  expect(conflict.localEntities.some((entity: any) => entity.sync_status === 'conflict')).toBeTruthy();

  const remoteRows: Record<string, any[]> = {};
  const mediaHashes: any[] = [];
  for (const collection of ['survey_events', 'occurrences', 'territorial_changes', 'media_evidence']) {
    remoteRows[collection] = (await json(`/api/collections/${collection}/records?perPage=200&filter=${encodeURIComponent('sync_key != ""')}`, { headers: { Authorization: seeds.token } })).items;
  }
  for (const localMedia of dataset.media) {
    const remote = remoteRows.media_evidence.find((item) => item.sync_key === localMedia.sync_key);
    const fileResponse = await fetch(`${api}/api/files/${remote.collectionId}/${remote.id}/${remote.original_file}?token=${encodeURIComponent(seeds.token)}`, { headers: { Connection: 'close' } });
    const remoteHash = createHash('sha256').update(Buffer.from(await fileResponse.arrayBuffer())).digest('hex');
    mediaHashes.push({ media_id: localMedia.media.media_id, local_sha256: localMedia.media.sha256, remote_sha256: remoteHash, match: remoteHash === localMedia.media.sha256 });
  }
  mkdirSync(resolve('artifacts/block-d'), { recursive: true });
  const runCounts = (run: string) => Object.fromEntries(Object.entries(remoteRows).map(([collection, rows]) => [collection, rows.filter((row) => row.sync_key.includes(`:${collection === 'survey_events' ? 'survey_event:event' : collection === 'occurrences' ? 'occurrence:occ' : collection === 'territorial_changes' ? 'territorial_change:change' : 'media_evidence:media'}-${run}`)).length]));
  writeFileSync(resolve('artifacts/block-d/remote-sync-acceptance.json'), JSON.stringify({ normal_counts: runCounts('A'), recovery_counts: Object.fromEntries(Object.entries(remoteRows).map(([collection, rows]) => [collection, rows.length])), records: Object.fromEntries(Object.entries(remoteRows).map(([collection, rows]) => [collection, rows.map((row) => ({ local_id: row.local_id, sync_key: row.sync_key, server_id: row.server_id }))])), media_hashes: mediaHashes, conflict: { detected: conflict.result.conflicts > 0, local_preserved: conflict.localEntities.some((entity: any) => entity.sync_status === 'conflict') } }, null, 2));
});
