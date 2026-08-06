import { test, expect } from '@playwright/test';

test.describe('Acceso a Biocorredor MR', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should identify the current application', async ({ page }) => {
    await expect(page).toHaveTitle(/Biocorredor MR/i);
    await expect(page.getByRole('heading', { name: 'Biocorredor MR', exact: true })).toBeVisible();
  });

  test('should show the assigned-access login flow', async ({ page }) => {
    await expect(page.getByPlaceholder('Email')).toBeVisible();
    await expect(page.getByPlaceholder('Contraseña')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ingresar', exact: true })).toBeVisible();
    await expect(page.getByText('Acceso asignado por coordinación')).toBeVisible();
  });

  test('should not expose the legacy sighting entry point before a field journey', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Añadir Hallazgo', exact: true })).toHaveCount(0);
  });

  test('should remain usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByRole('heading', { name: 'Biocorredor MR', exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Email')).toBeVisible();
    await expect(page.getByPlaceholder('Contraseña')).toBeVisible();
  });
});
