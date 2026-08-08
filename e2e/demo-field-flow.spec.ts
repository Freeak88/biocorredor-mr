import { test, expect } from '@playwright/test';

const email = process.env.DEMO_FIELD_EMAIL;
const password = process.env.DEMO_FIELD_PASSWORD;

test.describe('D.1 demo de campo contra backend real', () => {
  test.skip(!email || !password, 'Requiere DEMO_FIELD_EMAIL y DEMO_FIELD_PASSWORD con una asignación real activa.');

  test('observador guarda, reabre offline y sincroniza', async ({ page, context }) => {
    await page.goto('/');
    await page.getByPlaceholder('Email').fill(email!);
    await page.getByPlaceholder('Contraseña').fill(password!);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByText('Jornada')).toBeVisible();
    await page.getByTitle('Abrir jornada de campo').click();
    await expect(page.getByText('Jornada de campo')).toBeVisible();
    await expect(page.getByText(/Sin conexión|Sincronizado|Pendiente de sincronización|Aún no sincronizado/)).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText('Jornada')).toBeVisible();
    await page.getByTitle('Abrir jornada de campo').click();
    await expect(page.getByText('Sin conexión')).toBeVisible();

    await context.setOffline(false);
    await page.reload();
    await expect(page.getByText('Jornada')).toBeVisible();
  });
});

