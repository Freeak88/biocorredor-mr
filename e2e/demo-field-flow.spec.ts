import { test, expect, request as playwrightRequest } from '@playwright/test';

const email = process.env.DEMO_FIELD_EMAIL;
const password = process.env.DEMO_FIELD_PASSWORD;

test.describe('D.1 demo de campo contra backend real', () => {
  test.skip(!email || !password, 'Requiere DEMO_FIELD_EMAIL y DEMO_FIELD_PASSWORD con una asignación real activa.');

  test('observador guarda, reabre offline y sincroniza', async ({ page, context }, testInfo) => {
    let offlineMode = false;
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !(window as Window & { __demoOffline?: boolean }).__demoOffline });
    });
    await page.route('**/api/**', (route) => offlineMode ? route.abort() : route.continue());
    await page.goto('/index.html');
    await page.getByPlaceholder('Email').fill(email!);
    await page.getByPlaceholder('Contraseña').fill(password!);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('button', { name: 'Jornada', exact: true })).toBeVisible();
    await expect(page.getByText('Observadora Demo 1', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('01-home-online.png'), fullPage: true });
    await page.getByRole('button', { name: 'Cerrar jornada', exact: true }).click();
    for (const width of [360, 390, 412]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(page.getByText('Observadora Demo 1', { exact: true })).toBeVisible();
      if (width < 640) await expect(page.getByTitle('Abrir jornada de campo')).toBeVisible();
      else await expect(page.getByRole('button', { name: 'Jornada', exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`01-home-final-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByTitle('Abrir jornada de campo').click();
    await expect(page.getByRole('heading', { name: 'Jornada de campo' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/SEC-CENTRO|Sector Centro/).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByTitle('Estado de tus registros')).toBeVisible();
    const start = page.getByRole('button', { name: 'Iniciar jornada' });
    if (await start.isVisible() && await start.isEnabled()) await start.click();
    await expect(page.getByRole('button', { name: /Nueva observación/ })).toBeVisible({ timeout: 15000 });
    // Preflight: visit the lazy field panel once while online so the shell cache is complete.
    await page.getByRole('button', { name: /Nueva observación/ }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo relevamiento' })).toBeVisible();
    await page.getByLabel('Cerrar relevamiento').click();
    await page.getByTitle('Más opciones').click();
    await page.getByRole('button', { name: /Mis registros/ }).click();
    await expect(page.getByRole('heading', { name: 'Mis registros', exact: true })).toBeVisible();
    await page.getByTitle('Cerrar').click();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await expect.poll(() => page.evaluate(async () => (await (await caches.open('biocorredor-shell-v8')).keys()).length)).toBeGreaterThan(2);

    offlineMode = true;
    await page.evaluate(() => { (window as Window & { __demoOffline?: boolean }).__demoOffline = true; window.dispatchEvent(new Event('offline')); });
    await page.screenshot({ path: testInfo.outputPath('04-offline-final.png'), fullPage: true });
    await page.getByTitle('Abrir jornada de campo').click();
    await expect(page.getByRole('heading', { name: 'Jornada de campo' })).toBeVisible();
    await page.getByRole('button', { name: /Nueva observación/ }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo relevamiento' })).toBeVisible();
    await page.getByLabel('Organismo o grupo').fill('Hongo de prueba');
    const paperId = page.getByLabel(/Ficha en papel \/ QR/);
    await paperId.fill('MR-20260815-P017');
    await expect(paperId).toHaveValue('MR-20260815-P017');
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'evidencia-demo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
    await page.getByRole('button', { name: 'Guardar relevamiento' }).click();
    await expect(page.getByText(/Guardado en este teléfono|Pendiente de envío/)).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: testInfo.outputPath('05-saved-local-final.png'), fullPage: true });
    await page.getByLabel('Cerrar relevamiento').click();
    await page.getByTitle('Más opciones').click();
    await page.getByRole('button', { name: /Mis registros/ }).click();
    await expect(page.getByRole('heading', { name: 'Mis registros', exact: true })).toBeVisible();
    await expect(page.getByText('Hongo de prueba')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('06-my-records-final.png'), fullPage: true });
    await page.getByTitle('Cerrar').click();

    await page.getByTitle('Abrir jornada de campo').click();
    await page.getByRole('button', { name: 'Cerrar jornada', exact: true }).last().click();
    await page.getByRole('button', { name: 'Confirmar cierre' }).click();
    await expect(page.getByText('Cierre pendiente de sincronización.').first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('05-journey-close-pending.png'), fullPage: true });
    await page.getByLabel('Cerrar jornada').click();

    await page.goto('/index.html');
    await page.waitForTimeout(1000);
    await expect(page.getByRole('button', { name: 'Jornada', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Jornada de campo' })).toBeVisible({ timeout: 15000 });
    await page.getByLabel('Cerrar jornada').click();
    await page.getByTitle('Más opciones').click();
    await page.getByRole('button', { name: /Mis registros/ }).click();
    await expect(page.getByText('Hongo de prueba')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('05-recovered-after-restart.png'), fullPage: true });
    await page.getByTitle('Cerrar').click();

    offlineMode = false;
    await page.evaluate(() => { (window as Window & { __demoOffline?: boolean }).__demoOffline = false; window.dispatchEvent(new Event('online')); });
    await page.getByTitle('Abrir jornada de campo').click();
    await page.screenshot({ path: testInfo.outputPath('07-online-pending-final.png'), fullPage: true });
    await page.getByRole('button', { name: 'Sincronizar cierre' }).click();
    await expect(page.getByText('Cierre sincronizado.').first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByTitle('Estado de tus registros')).toContainText('Todo enviado al sistema central', { timeout: 30000 });
    await page.screenshot({ path: testInfo.outputPath('08-sent-central-final.png'), fullPage: true });

    const api = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:8090' });
    const auth = await api.post('/api/collections/users/auth-with-password', { data: { identity: email, password } });
    expect(auth.ok()).toBeTruthy();
    const session = await auth.json();
    const result = await api.get(`/api/collections/occurrences/records?filter=${encodeURIComponent('paper_id = "MR-20260815-P017"')}`, { headers: { Authorization: session.token } });
    expect(result.ok()).toBeTruthy();
    expect((await result.json()).totalItems).toBeGreaterThan(0);
    await api.dispose();
  });
});
