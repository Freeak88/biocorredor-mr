import { chromium, expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || (process.env.PLAYWRIGHT_PRODUCTION === '1' ? 'http://127.0.0.1:4173' : 'http://localhost:3000');
const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const pngHash = createHash('sha256').update(pngBytes).digest('hex');

async function setPhoto(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('Foto original').setInputFiles({ name, mimeType: 'image/png', buffer: pngBytes });
}

test('Modo Campo MR completa el ciclo offline y captura despues de reabrir', async () => {
  test.setTimeout(60000);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'biocorredor-mr-20260815-'));
  const contextOptions = {
    headless: true,
    serviceWorkers: 'allow' as const,
    geolocation: { latitude: -34.829, longitude: -58.376, accuracy: 12 },
    permissions: ['geolocation'],
  };
  const context = await chromium.launchPersistentContext(profile, contextOptions);
  const page = await context.newPage();

  await page.goto(`${baseURL}/field-fallback/`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cacheUrls = await page.evaluate(async () => (await (await caches.open('biocorredor-field-fallback-v2')).keys()).map((request) => request.url));
  expect(cacheUrls).toEqual(expect.arrayContaining([`${baseURL}/field-fallback/index.html`, `${baseURL}/field-fallback/fallback.js`, `${baseURL}/field-fallback/fallback.css`, `${baseURL}/field-fallback/manifest.webmanifest`]));

  await page.getByRole('button', { name: /Crear jornada local/i }).click();
  await expect(page.getByText(/MR-20260815/)).toBeVisible();

  await page.getByLabel('Descripcion objetiva').fill('Herbacea observada en el bajo');
  await page.getByLabel('Categoria').selectOption('flora');
  await page.getByLabel('Certeza').selectOption('probable');
  await page.getByRole('combobox', { name: 'Ambiente' }).selectOption('bajo_dulce');
  await page.getByLabel('Abundancia').selectOption('scarce');
  await page.getByLabel('Fenologia').selectOption('vegetative');
  await page.getByRole('button', { name: /Capturar GPS/i }).click();
  await setPhoto(page, 'observation-a.png');
  await page.getByRole('button', { name: /Guardar en este telefono/i }).click();
  await page.waitForTimeout(250);

  await page.getByRole('button', { name: /Cambio territorial/i }).click();
  await page.getByLabel('Descripcion objetiva').fill('Relleno visible junto al camino');
  await page.getByLabel('Foto original').setInputFiles({ name: 'change-b.png', mimeType: 'image/png', buffer: pngBytes });
  await page.getByRole('button', { name: /Guardar en este telefono/i }).click();
  await page.waitForTimeout(250);
  await expect(page.getByText(/2 registros · 2 fotografias/i)).toBeVisible();

  await context.setOffline(true);
  await context.close();

  const reopened = await chromium.launchPersistentContext(profile, { ...contextOptions, offline: true });
  const offlinePage = await reopened.newPage();
  const mimeErrors: string[] = [];
  offlinePage.on('response', (response) => {
    const contentType = response.headers()['content-type'] || '';
    if (['script', 'style', 'manifest'].includes(response.request().resourceType()) && contentType.includes('text/html')) mimeErrors.push(response.url());
  });
  await offlinePage.goto(`${baseURL}/field-fallback/`, { waitUntil: 'domcontentloaded' });
  await expect(offlinePage.getByText(/Registros locales/i)).toBeVisible();
  await expect(offlinePage.getByText(/2 registros · 2 fotografias/i)).toBeVisible();
  await expect(offlinePage.getByText(/foto persistida/i)).toHaveCount(2);
  expect(mimeErrors).toEqual([]);

  await offlinePage.getByRole('button', { name: /Observacion/i }).click();
  await offlinePage.getByLabel('Descripcion objetiva').fill('Registro C posterior a reapertura');
  await offlinePage.getByLabel('Categoria').selectOption('funga');
  await offlinePage.getByLabel('Certeza').selectOption('unknown');
  await offlinePage.getByRole('combobox', { name: 'Ambiente' }).selectOption('bajo_dulce');
  await offlinePage.getByLabel('Abundancia').selectOption('isolated');
  await offlinePage.getByLabel('Fenologia').selectOption('unknown');
  await offlinePage.getByRole('button', { name: /Capturar GPS/i }).click();
  await setPhoto(offlinePage, 'observation-c.png');
  await offlinePage.getByRole('button', { name: /Guardar en este telefono/i }).click();
  await offlinePage.waitForTimeout(250);
  await expect(offlinePage.getByText(/3 registros · 3 fotografias/i)).toBeVisible();

  await offlinePage.getByRole('button', { name: /Cerrar jornada/i }).click();
  await expect(offlinePage.getByText(/JORNADA CERRADA LOCALMENTE/i)).toBeVisible();

  const resourceTable = await offlinePage.evaluate(async (origin) => {
    const resources = [
      { url: '/field-fallback/index.html', destination: 'document' },
      { url: '/field-fallback/fallback.js', destination: 'script' },
      { url: '/field-fallback/fallback.css', destination: 'style' },
      { url: '/field-fallback/manifest.webmanifest', destination: 'manifest' },
    ];
    return Promise.all(resources.map(async (resource) => {
      const response = await caches.match(resource.url);
      return { url: new URL(resource.url, origin).href, destination: resource.destination, status: response?.status ?? 0, contentType: response?.headers.get('content-type') ?? null, origin: 'service-worker-precache' };
    }));
  }, baseURL);
  console.log(`OFFLINE_RESOURCE_TABLE ${JSON.stringify(resourceTable)}`);

  const downloadPromise = offlinePage.waitForEvent('download');
  await offlinePage.getByRole('button', { name: /Exportar ZIP/i }).click();
  const download = await downloadPromise;
  const zipPath = path.join(profile, 'acceptance.zip');
  await download.saveAs(zipPath);
  const artifactPath = path.join(process.cwd(), 'artifacts', 'block-a', 'biocorredor-MR-20260815-acceptance.zip');
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.copyFile(zipPath, artifactPath);

  const extractPath = path.join(profile, 'extracted');
  await fs.mkdir(extractPath);
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractPath}' -Force`]);
  const manifest = JSON.parse(await fs.readFile(path.join(extractPath, 'manifest.json'), 'utf8'));
  const backup = JSON.parse(await fs.readFile(path.join(extractPath, 'backup.json'), 'utf8'));
  expect(backup.journeys).toHaveLength(1);
  const journey = backup.journeys[0];
  expect(journey.eventId).toBe('MR-20260815');
  expect(journey.eventName).toBe('Relevamiento MR 15/08');
  expect(journey.teamId).toBe('TEAM-01');
  expect(journey.observerName).toBe('Observador piloto');
  expect(journey.sectorId).toBe('SECTOR-02');
  expect(journey.deviceId).toBe('DEVICE-01');
  expect(journey.protocolVersion).toBe('1.0');
  expect(journey.status).toBe('closed');
  expect(journey.startedAt).toBeTruthy();
  expect(journey.completedAt).toBeTruthy();

  expect(backup.records).toHaveLength(3);
  expect(new Set(backup.records.map((record: { id: string }) => record.id)).size).toBe(3);
  expect(backup.records.every((record: { journeyId: string }) => record.journeyId === journey.id)).toBe(true);
  expect(backup.records.some((record: { category: string; environment: string; abundance: string; certainty: string }) => record.category === 'flora' && record.environment === 'bajo_dulce' && record.abundance === 'scarce' && record.certainty === 'probable')).toBe(true);
  expect(backup.records.some((record: { kind: string; objectiveDescription: string }) => record.kind === 'territorial_change' && record.objectiveDescription.includes('Relleno'))).toBe(true);
  const recordC = backup.records.find((record: { fieldName?: string }) => record.fieldName === 'Registro C posterior a reapertura');
  expect(recordC).toMatchObject({ eventId: 'MR-20260815', sectorId: 'SECTOR-02', category: 'funga', environment: 'bajo_dulce', abundance: 'isolated', certainty: 'unknown', latitude: -34.829, longitude: -58.376, accuracyM: 12, accuracy: 12, locationSource: 'gps' });
  expect(recordC?.timestamp).toBeTruthy();

  expect(backup.media).toHaveLength(3);
  for (const media of backup.media) {
    expect(media.mimeType).toBe('image/png');
    expect(media.size).toBe(pngBytes.length);
    expect(media.sha256).toBe(pngHash);
    const mediaPath = path.join(extractPath, 'media', 'originals', `${media.id}-${media.name}`);
    const extractedBytes = await fs.readFile(mediaPath);
    expect(extractedBytes.equals(pngBytes)).toBe(true);
    expect(createHash('sha256').update(extractedBytes).digest('hex')).toBe(media.sha256);
  }
  expect(manifest.records).toBe(3);
  expect(manifest.media).toBe(3);
  expect(manifest.hashes.backup).toBe(createHash('sha256').update(await fs.readFile(path.join(extractPath, 'backup.json'))).digest('hex'));
  expect(createHash('sha256').update(JSON.stringify({ ...manifest, manifest_sha256: '' }, null, 2)).digest('hex')).toBe(manifest.manifest_sha256);
  console.log(`ZIP_ARTIFACT ${artifactPath}`);
  await reopened.close();
});
