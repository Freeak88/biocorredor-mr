import { chromium, test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || (process.env.PLAYWRIGHT_PRODUCTION === '1' ? 'http://127.0.0.1:4173' : 'http://localhost:3000');

test('fallback estatico sobrevive a reinicio completo offline', async () => {
  test.setTimeout(60000);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'biocorredor-fallback-'));
  const context = await chromium.launchPersistentContext(profile, { headless: true, serviceWorkers: 'allow' });
  const page = await context.newPage();
  await page.goto(`${baseURL}/field-fallback/`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const resources = await page.evaluate(async () => {
    const cache = await caches.open('biocorredor-field-fallback-v2');
    const requests = await cache.keys();
    return requests.map((request) => request.url);
  });
  expect(resources).toEqual(expect.arrayContaining([`${baseURL}/field-fallback/index.html`, `${baseURL}/field-fallback/fallback.js`, `${baseURL}/field-fallback/fallback.css`, `${baseURL}/field-fallback/manifest.webmanifest`]));

  await page.getByRole('button', { name: /Crear jornada local/i }).click();
  const photo = { name: 'test.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('foto-original-de-prueba') };
  for (const name of ['obs-1.jpg', 'obs-2.jpg']) {
    await page.getByLabel('Foto original').setInputFiles({ ...photo, name });
    await page.getByRole('button', { name: /Guardar en este telefono/i }).click();
    await page.waitForTimeout(250);
  }
  await page.getByRole('button', { name: /Cambio territorial/i }).click();
  await page.getByLabel('Descripcion objetiva').fill('Relleno visible');
  await page.getByLabel('Foto original').setInputFiles({ ...photo, name: 'change.jpg' });
  await page.getByRole('button', { name: /Guardar en este telefono/i }).click();
  await page.waitForTimeout(250);
  await expect(page.getByText(/3 registros · 3 fotografias/i)).toBeVisible();
  expect(await page.evaluate(async () => (await (await caches.open('biocorredor-field-fallback-v2')).keys()).length)).toBeGreaterThanOrEqual(4);

  await context.setOffline(true);
  await context.close();
  const reopened = await chromium.launchPersistentContext(profile, { headless: true, serviceWorkers: 'allow' });
  await reopened.setOffline(true);
  const offlinePage = await reopened.newPage();
  const mimeErrors: string[] = [];
  offlinePage.on('response', async (response) => {
    const type = response.headers()['content-type'] || '';
    if (['script', 'style', 'manifest'].includes(response.request().resourceType()) && type.includes('text/html')) mimeErrors.push(response.url());
  });
  await offlinePage.goto(`${baseURL}/field-fallback/`, { waitUntil: 'domcontentloaded' });
  await expect(offlinePage.getByText(/Registros locales/i)).toBeVisible();
  await expect(offlinePage.getByText(/3 registros · 3 fotografias/i)).toBeVisible();
  await expect(offlinePage.getByText(/foto persistida/i)).toHaveCount(3);
  expect(mimeErrors).toEqual([]);

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
  const zipPath = path.join(profile, 'fallback-export.zip');
  await download.saveAs(zipPath);
  const artifactPath = path.join(process.cwd(), 'artifacts', 'block-a', 'biocorredor-field-fallback-demo.zip');
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.copyFile(zipPath, artifactPath);
  const extractPath = path.join(profile, 'extracted');
  await fs.mkdir(extractPath);
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractPath}' -Force`]);
  const manifest = JSON.parse(await fs.readFile(path.join(extractPath, 'manifest.json'), 'utf8'));
  const backup = JSON.parse(await fs.readFile(path.join(extractPath, 'backup.json'), 'utf8'));
  expect(manifest.records).toBe(3); expect(manifest.media).toBe(3); expect(backup.records).toHaveLength(3); expect(backup.media).toHaveLength(3);
  const manifestForHash = { ...manifest, manifest_sha256: '' };
  expect(createHash('sha256').update(JSON.stringify(manifestForHash, null, 2)).digest('hex')).toBe(manifest.manifest_sha256);
  const backupBytes = await fs.readFile(path.join(extractPath, 'backup.json'));
  expect(createHash('sha256').update(backupBytes).digest('hex')).toBe(manifest.hashes.backup);
  for (const media of backup.media) {
    const mediaPath = path.join(extractPath, 'media', 'originals', `${media.id}-${media.name}`);
    expect(createHash('sha256').update(await fs.readFile(mediaPath)).digest('hex')).toBe(media.sha256);
    expect(manifest.hashes[`media/originals/${media.id}-${media.name}`]).toBe(media.sha256);
  }
  console.log(`ZIP_ARTIFACT ${artifactPath}`);
  await reopened.close();
});
