import { chromium, expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || (process.env.PLAYWRIGHT_PRODUCTION === '1' ? 'http://127.0.0.1:4173' : 'http://localhost:3000');
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const imageHash = createHash('sha256').update(imageBytes).digest('hex');

async function attach(page: import('@playwright/test').Page, label: string, name: string) {
  await page.getByLabel(label).setInputFiles({ name, mimeType: 'image/png', buffer: imageBytes });
}

test('paper_id y ficha fisica sobreviven offline y se detecta duplicado local', async () => {
  test.setTimeout(60000);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'biocorredor-paper-'));
  const contextOptions = { headless: true, serviceWorkers: 'allow' as const, offline: false };
  const context = await chromium.launchPersistentContext(profile, contextOptions);
  const page = await context.newPage();
  await page.goto(`${baseURL}/field-fallback/?paper=mr-20260815-p017`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Ficha fisica detectada: MR-20260815-P017')).toBeVisible();
  await page.getByRole('button', { name: /Crear jornada local/i }).click();
  await page.getByLabel('Descripcion objetiva').fill('Observacion asociada a ficha P017');
  await page.getByLabel('Ficha en papel / QR').fill('MR-20260815-P121');
  await page.getByRole('button', { name: /Guardar en este telefono/i }).click();
  await expect(page.getByText(/El ID debe tener formato/i)).toBeVisible();
  await page.getByLabel('Ficha en papel / QR').fill('mr-20260815-p017');
  await attach(page, 'Foto original', 'biological.png');
  await attach(page, 'Foto / escaneo de ficha', 'paper-sheet.png');
  await page.getByRole('button', { name: /Guardar en este telefono/i }).click();
  await page.waitForTimeout(250);
  await expect(page.getByRole('listitem').filter({ hasText: 'MR-20260815-P017' })).toBeVisible();

  await context.setOffline(true);
  await context.close();
  const reopened = await chromium.launchPersistentContext(profile, { ...contextOptions, offline: true });
  const offlinePage = await reopened.newPage();
  await offlinePage.goto(`${baseURL}/field-fallback/`, { waitUntil: 'domcontentloaded' });
  await expect(offlinePage.getByRole('listitem').filter({ hasText: 'MR-20260815-P017' })).toBeVisible();
  await expect(offlinePage.getByText(/2 fotografias/i)).toBeVisible();

  await offlinePage.getByLabel('Ficha en papel / QR').fill('MR-20260815-P017');
  await offlinePage.getByRole('button', { name: /Guardar en este telefono/i }).click();
  await expect(offlinePage.getByText(/Esta ficha ya esta asociada a un registro local/i)).toBeVisible();
  await expect(offlinePage.getByText(/1 registros · 2 fotografias/i)).toBeVisible();

  const firstDownload = offlinePage.waitForEvent('download');
  await offlinePage.getByRole('button', { name: /Exportar ZIP/i }).click();
  const firstZip = await firstDownload;
  const zipPath = path.join(profile, 'paper-acceptance.zip');
  await firstZip.saveAs(zipPath);
  const artifactPath = path.join(process.cwd(), 'artifacts', 'block-a', 'biocorredor-MR-20260815-paper-acceptance.zip');
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.copyFile(zipPath, artifactPath);
  const secondDownload = offlinePage.waitForEvent('download');
  await offlinePage.getByRole('button', { name: /Exportar ZIP/i }).click();
  const secondZip = await secondDownload;
  const secondZipPath = path.join(profile, 'paper-acceptance-retry.zip');
  await secondZip.saveAs(secondZipPath);
  const extractPath = path.join(profile, 'extracted');
  await fs.mkdir(extractPath);
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractPath}' -Force`]);
  const backup = JSON.parse(await fs.readFile(path.join(extractPath, 'backup.json'), 'utf8'));
  const manifest = JSON.parse(await fs.readFile(path.join(extractPath, 'manifest.json'), 'utf8'));
  expect(backup.records).toHaveLength(1);
  expect(backup.records[0]).toMatchObject({ paperId: 'MR-20260815-P017', paperSource: true, syncStatus: 'local_only' });
  expect(backup.audit.map((entry: { action: string }) => entry.action)).toEqual(expect.arrayContaining(['PAPER_ID_ASSIGNED', 'PAPER_IMAGE_ATTACHED']));
  expect(backup.media).toHaveLength(2);
  const paperMedia = backup.media.find((media: { mediaRole: string }) => media.mediaRole === 'paper_original');
  expect(paperMedia).toMatchObject({ paperId: 'MR-20260815-P017', mimeType: 'image/png', size: imageBytes.length, sha256: imageHash, syncStatus: 'local_only' });
  const paperPath = path.join(extractPath, 'paper', 'MR-20260815-P017', 'paper-sheet.png');
  const extractedPaper = await fs.readFile(paperPath);
  expect(extractedPaper.equals(imageBytes)).toBe(true);
  expect(manifest.hashes['paper/MR-20260815-P017/paper-sheet.png']).toBe(imageHash);
  expect(manifest.records).toBe(1);
  expect(manifest.media).toBe(2);
  console.log(`PAPER_ZIP_ARTIFACT ${artifactPath}`);
  await reopened.close();
});
