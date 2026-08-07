import { test, expect } from '@playwright/test';

test.describe('Fallback local sin PocketBase', () => {
  test('conserva jornada, registros y fotos después de recargar offline', async ({ page, context }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Abrir modo de contingencia/i }).click();
    await page.getByRole('button', { name: /Crear jornada local/i }).click();
    await expect(page.getByText(/Jornada activa localmente/i)).toBeVisible();

    const photo = { name: 'prueba.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('foto-original-de-prueba') };
    await page.getByLabel('Foto original').setInputFiles(photo);
    await page.getByRole('button', { name: /Guardar en este teléfono/i }).click();
    await page.getByRole('button', { name: /Observación/i }).click();
    await page.getByLabel('Descripción o nombre').fill('Observación sin identificar');
    await page.getByLabel('Foto original').setInputFiles({ ...photo, name: 'prueba-2.jpg' });
    await page.getByRole('button', { name: /Guardar en este teléfono/i }).click();
    await page.getByRole('button', { name: /Cambio territorial/i }).click();
    await page.getByLabel('Descripción o nombre').fill('Relleno visible');
    await page.getByLabel('Foto original').setInputFiles({ ...photo, name: 'cambio.jpg' });
    await page.getByRole('button', { name: /Guardar en este teléfono/i }).click();
    await expect(page.getByText(/3 registros · 3 fotografías/i)).toBeVisible();

    await page.evaluate(async () => { if ('serviceWorker' in navigator) await navigator.serviceWorker.ready; });
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Abrir modo de contingencia/i }).click();
    await expect(page.getByText(/3 registros · 3 fotografías/i)).toBeVisible();
    await expect(page.getByText(/foto persistida/i)).toHaveCount(3);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Exportar ZIP local/i }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();
    const bytes = await require('node:fs').promises.readFile(path!);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    await context.setOffline(false);
  });
});
