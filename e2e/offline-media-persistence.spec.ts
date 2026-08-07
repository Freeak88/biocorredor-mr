import { chromium, expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || (process.env.PLAYWRIGHT_PRODUCTION === '1' ? 'http://127.0.0.1:4173' : 'http://localhost:3000');
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const imageHash = createHash('sha256').update(imageBytes).digest('hex');

async function attach(page: import('@playwright/test').Page, label: string, name: string) {
  await page.getByLabel(label).setInputFiles({ name, mimeType: 'image/png', buffer: imageBytes });
}

async function readMedia(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('biocorredor-field-fallback-v2');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const media = await new Promise<any[]>((resolve, reject) => {
      const request = db.transaction('media', 'readonly').objectStore('media').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return Promise.all(media.map(async (item) => {
      const bytes = new Uint8Array(await item.blob.arrayBuffer());
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return { ...item, blob: undefined, recalculatedSha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''), blobSize: bytes.length };
    }));
  });
}

test('cinco evidencias originales sobreviven al reinicio offline y reconstruyen previews', async () => {
  test.setTimeout(60000);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'biocorredor-media-'));
  const contextOptions = { headless: true, serviceWorkers: 'allow' as const, offline: false };
  const context = await chromium.launchPersistentContext(profile, contextOptions);
  const page = await context.newPage();
  await page.goto(`${baseURL}/field-fallback/`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Crear jornada local/i }).click();
  await context.setOffline(true);

  await page.getByLabel('Descripcion objetiva').fill('Ocurrencia biologica A');
  await page.getByLabel('Categoria').selectOption('flora');
  await attach(page, 'Foto original', 'biological-a.png');
  await page.getByRole('button', { name: /Guardar en este telefono/i }).click();
  await page.waitForTimeout(300);

  await page.getByLabel('Descripcion objetiva').fill('Ambiente y caracter diagnostico B');
  await attach(page, 'Foto de ambiente', 'habitat-b.png');
  await attach(page, 'Detalle diagnostico', 'diagnostic-b.png');
  await page.getByRole('button', { name: /Guardar en este telefono/i }).click();
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: /Cambio territorial/i }).click();
  await page.getByLabel('Descripcion objetiva').fill('Cambio territorial de prueba');
  await attach(page, 'Foto original', 'territorial.png');
  await page.getByRole('button', { name: /Guardar en este telefono/i }).click();
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: /Observacion/i }).click();
  await page.getByLabel('Ficha en papel / QR').fill('MR-20260815-P017');
  await page.getByLabel('Descripcion objetiva').fill('Registro en ficha fisica');
  await attach(page, 'Foto / escaneo de ficha', 'paper-original.png');
  await page.getByRole('button', { name: /Guardar en este telefono/i }).click();
  await page.waitForTimeout(300);
  await expect(page.getByText(/4 registros · 5 fotografias/i)).toBeVisible();

  const before = await readMedia(page);
  expect(before).toHaveLength(5);
  expect(before.every((item) => item.blobSize === imageBytes.length && item.sha256 === imageHash && item.recalculatedSha256 === imageHash)).toBe(true);
  expect(before.map((item) => item.mediaRole).sort()).toEqual(['biological_evidence', 'diagnostic_detail', 'habitat_context', 'paper_original', 'territorial_evidence'].sort());
  expect(before.every((item) => item.parentLocalId && item.mimeType === 'image/png' && item.syncStatus === 'local_only')).toBe(true);
  expect(await page.locator('.media-thumb').count()).toBe(5);
  expect(await page.locator('.media-thumb').evaluateAll((images) => images.every((image) => image.getAttribute('src')?.startsWith('blob:')))).toBe(true);

  await context.close();
  const reopened = await chromium.launchPersistentContext(profile, { ...contextOptions, offline: true });
  const offlinePage = await reopened.newPage();
  await offlinePage.goto(`${baseURL}/field-fallback/`, { waitUntil: 'domcontentloaded' });
  await expect(offlinePage.getByText(/4 registros · 5 fotografias/i)).toBeVisible();
  await expect(offlinePage.locator('.media-thumb')).toHaveCount(5);
  const after = await readMedia(offlinePage);
  expect(after).toHaveLength(5);
  expect(after.every((item) => item.blobSize === imageBytes.length && item.sha256 === imageHash && item.recalculatedSha256 === imageHash)).toBe(true);
  expect(after.map((item) => item.mediaRole).sort()).toEqual(before.map((item) => item.mediaRole).sort());
  expect(after.map((item) => item.parentLocalId).sort()).toEqual(before.map((item) => item.parentLocalId).sort());

  await offlinePage.getByRole('button', { name: /Cerrar jornada/i }).click();
  await expect(offlinePage.getByText(/JORNADA CERRADA LOCALMENTE/i)).toBeVisible();
  expect(await readMedia(offlinePage)).toHaveLength(5);
  await reopened.close();
});
