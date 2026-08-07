import { chromium, expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || (process.env.PLAYWRIGHT_PRODUCTION === '1' ? 'http://127.0.0.1:4173' : 'http://localhost:3000');
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

async function attach(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('Foto original').setInputFiles({ name, mimeType: 'image/png', buffer: imageBytes });
}

test('jornada metodologica estandarizada se recupera y cierra completamente offline', async () => {
  test.setTimeout(60000);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'biocorredor-methodology-'));
  const contextOptions = { headless: true, serviceWorkers: 'allow' as const, offline: false };
  const context = await chromium.launchPersistentContext(profile, contextOptions);
  const page = await context.newPage();

  await page.goto(`${baseURL}/field-fallback/`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.getByLabel('Estrato').locator('option')).toContainText(['MR-PAS']);
  await expect(page.getByLabel('Unidad de muestreo').locator('option')).toContainText(['MR-PAS-T01']);

  await page.getByLabel('Version de protocolo').fill('1.1');
  await page.getByLabel('Modo de inventario').selectOption('standardized');
  await page.getByLabel('Estrato').selectOption('stratum-mr-pas');
  await page.getByLabel('Unidad de muestreo').selectOption('unit-mr-pas-t01');
  await page.getByLabel('Diseño').selectOption('stratified');
  await page.getByLabel('Metodo').selectOption('transect');
  await page.getByRole('spinbutton', { name: 'Esfuerzo' }).fill('30');
  await page.getByLabel('Unidad de esfuerzo').selectOption('minutes');
  await page.getByRole('button', { name: /Crear jornada local/i }).click();
  await expect(page.getByText(/MR-PAS.*MR-PAS-T01/)).toBeVisible();

  await page.getByLabel('Ficha en papel / QR').fill('MR-20260815-P017');
  await page.getByLabel('Descripcion objetiva').fill('Sin identificar');
  await page.getByLabel('Codigo de morfoespecie').fill('MORFO-PL-001');
  await page.getByLabel('Tipo de evidencia').selectOption('visual');
  await attach(page, 'observation-a.png');
  await page.getByRole('button', { name: /Guardar en este telefono/i }).click();
  await page.waitForTimeout(200);

  await page.getByLabel('Descripcion objetiva').fill('Cortadera');
  await page.getByLabel('Ficha en papel / QR').fill('');
  await page.getByLabel('Codigo de morfoespecie').fill('');
  await attach(page, 'observation-b.png');
  await page.getByRole('button', { name: /Guardar en este telefono/i }).click();
  await expect(page.getByText(/2 registros · 2 fotografias/i)).toBeVisible();

  await context.setOffline(true);
  await context.close();
  const reopened = await chromium.launchPersistentContext(profile, { ...contextOptions, offline: true });
  const offlinePage = await reopened.newPage();
  await offlinePage.goto(`${baseURL}/field-fallback/`, { waitUntil: 'domcontentloaded' });
  await expect(offlinePage.getByText(/MR-PAS.*MR-PAS-T01/)).toBeVisible();
  await expect(offlinePage.getByText(/2 registros · 2 fotografias/i)).toBeVisible();
  await expect(offlinePage.getByRole('listitem').filter({ hasText: 'MR-20260815-P017' })).toContainText('MORFO-PL-001');
  await expect(offlinePage.getByRole('listitem').filter({ hasText: 'Cortadera' })).toBeVisible();

  const downloadPromise = offlinePage.waitForEvent('download');
  await offlinePage.getByRole('button', { name: /Exportar ZIP/i }).click();
  const download = await downloadPromise;
  const zipPath = path.join(profile, 'methodology.zip');
  await download.saveAs(zipPath);
  const extractPath = path.join(profile, 'extracted');
  await fs.mkdir(extractPath);
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractPath}' -Force`]);
  const backup = JSON.parse(await fs.readFile(path.join(extractPath, 'backup.json'), 'utf8'));
  expect(backup.journeys[0]).toMatchObject({ protocolVersion: '1.1', inventoryMode: 'standardized', stratumCode: 'MR-PAS', samplingUnitCode: 'MR-PAS-T01', samplingDesign: 'stratified', samplingMethod: 'transect', samplingEffortValue: 30, samplingEffortUnit: 'minutes' });
  expect(backup.records).toEqual(expect.arrayContaining([
    expect.objectContaining({ paperId: 'MR-20260815-P017', morphospeciesCode: 'MORFO-PL-001', fieldName: 'Sin identificar', evidenceType: 'visual' }),
    expect.objectContaining({ paperId: null, fieldName: 'Cortadera' }),
  ]));

  await offlinePage.getByRole('button', { name: /Cerrar jornada/i }).click();
  await expect(offlinePage.getByText(/JORNADA CERRADA LOCALMENTE/i)).toBeVisible();
  await reopened.close();
});
