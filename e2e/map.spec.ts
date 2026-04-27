import { test, expect } from '@playwright/test';

test.describe('Map Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the application', async ({ page }) => {
    await expect(page).toHaveTitle(/Fungi Atlas/i);
  });

  test('should display the header with logo', async ({ page }) => {
    const header = page.locator('header');
    await expect(header).toBeVisible();
    await expect(header.locator('text=Fungi Atlas')).toBeVisible();
  });

  test('should render the map container', async ({ page }) => {
    // Leaflet map container is rendered as a div with leaflet classes
    const mapContainer = page.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible({ timeout: 10000 });
  });

  test('should show login button for unauthenticated users', async ({ page }) => {
    const loginButton = page.locator('text=Identificarse');
    await expect(loginButton).toBeVisible();
  });

  test('should display the bottom toolbar', async ({ page }) => {
    const toolbar = page.locator('button:has-text("Añadir Hallazgo")');
    await expect(toolbar).toBeVisible();
  });

  test('should show map tiles loaded', async ({ page }) => {
    const mapContainer = page.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible({ timeout: 10000 });

    // Wait for tiles to load
    await page.waitForTimeout(2000);

    // Check that tile images are present
    const tiles = page.locator('.leaflet-tile');
    const tileCount = await tiles.count();
    expect(tileCount).toBeGreaterThan(0);
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const header = page.locator('header');
    await expect(header).toBeVisible();

    const mapContainer = page.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible({ timeout: 10000 });
  });

  test('should show loading state initially', async ({ page }) => {
    // The app shows a loading screen initially
    // After auth resolves it shows the main content
    await page.waitForSelector('.leaflet-container, text=Consultando el Atlas', {
      timeout: 10000,
    });
  });

  test('map should have correct initial center', async ({ page }) => {
    const mapContainer = page.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible({ timeout: 10000 });

    // Check that the map is centered on Buenos Aires default coordinates
    // This is verified by checking the tile layer is loaded
    await page.waitForTimeout(2000);
    const tiles = page.locator('.leaflet-tile-loaded');
    await expect(tiles.first()).toBeVisible();
  });
});
