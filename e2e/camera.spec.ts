import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { dashboardSnapshot as snapshot } from './fixtures/dashboard-snapshot';

const thermalJpgPath = path.join(import.meta.dirname, 'fixtures', 'thermal.jpg');
const thermalJpgBytes = fs.readFileSync(thermalJpgPath);

test.beforeEach(async ({ page }) => {
  await page.route('**/api/snapshot', async (route) => {
    await route.fulfill({ json: snapshot });
  });
  await page.route('**/api/events', async (route) => {
    await route.abort('failed');
  });
  await page.route('**/api/entities/*/image**', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
      body: thermalJpgBytes
    });
  });
});

test('renders camera image tile inside the AtomS3U device card', async ({ page }) => {
  await page.goto('/');

  const atomsCard = page.locator('article.device').filter({
    has: page.getByRole('heading', { name: 'AtomS3U Sensor Rig' })
  });

  await expect(atomsCard).toBeVisible();

  // The camera tile renders an <img> whose src points at the binary image route
  // for the camera entity id.
  const img = atomsCard.locator('img[src*="/api/entities/"]').first();
  await expect(img).toBeVisible({ timeout: 5000 });
  const imgSrc = await img.getAttribute('src');
  expect(imgSrc).toContain('/api/entities/');
  expect(imgSrc).toContain('atoms3u_sensor_rig_thermal_camera');
});

test('camera does not appear on the device-settings page for AtomS3U', async ({ page }) => {
  await page.goto('/device-settings?device=atoms3u-sensor-rig');

  // The camera tile / camera component should not be present
  const allText = await page.locator('body').textContent();
  // "Thermal Camera" label should not appear in device settings
  expect(allText).not.toContain('camera-tile');

  // Camera img pointing to entities API should not be present
  const cameraImgs = page.locator('img[src*="/api/entities/"]');
  await expect(cameraImgs).toHaveCount(0);
});
