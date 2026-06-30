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

test('renders the thermal camera image tile on the dashboard', async ({ page }) => {
  await page.goto('/');

  // The camera now lives in the dashboard THERMAL panel (CameraImageTile), not a
  // per-device card. Its <img> src points at the binary image route for the camera
  // entity id.
  const tile = page.locator('.camera-tile');
  await expect(tile).toBeVisible();

  const img = tile.locator('img[src*="/api/entities/"]').first();
  await expect(img).toBeVisible({ timeout: 5000 });
  const imgSrc = await img.getAttribute('src');
  expect(imgSrc).toContain('/api/entities/');
  expect(imgSrc).toContain('atoms3u_sensor_rig_thermal_camera');
});

test('renders thermal quick controls below the camera image and posts commands', async ({ page }) => {
  const commands: Array<{ entityId: string; value: unknown }> = [];
  await page.route('**/api/entities/*/command', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const entityId = decodeURIComponent(pathname.split('/').at(-2) ?? '');
    const body = (route.request().postDataJSON() ?? {}) as { value?: unknown };
    commands.push({ entityId, value: body.value });
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto('/');

  const tile = page.locator('.camera-tile');
  const img = tile.locator('img[src*="/api/entities/"]').first();
  await expect(img).toBeVisible({ timeout: 5000 });

  // Quick controls live in a collapsible drawer below the image; expand it first.
  await tile.getByRole('button', { name: 'Controls' }).click();
  const controls = tile.locator('.camera-controls');
  await expect(controls).toBeVisible();
  const imageBox = await img.boundingBox();
  const controlsBox = await controls.boundingBox();
  expect(imageBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  expect(controlsBox!.y).toBeGreaterThan(imageBox!.y);

  await expect(tile.getByLabel('Palette')).toHaveValue('ironblack');
  await expect(tile.getByRole('button', { name: 'Overlay' })).toHaveAttribute('aria-pressed', 'false');
  await expect(tile.getByRole('button', { name: 'ROI Enabled' })).toHaveAttribute('aria-pressed', 'false');
  await expect(tile.getByLabel('ROI Size')).toHaveValue('3');
  await expect(tile.getByText('Row 6 / Column 8')).toBeVisible();
  await expect(tile.getByRole('group', { name: 'ROI position' })).not.toContainText('6/8');

  await tile.getByLabel('Palette').selectOption('rainbow');
  await expect.poll(() => commands.length).toBe(1);
  await tile.getByRole('button', { name: 'Overlay' }).click();
  await expect.poll(() => commands.length).toBe(2);
  await tile.getByRole('button', { name: 'ROI Enabled' }).click();
  await expect.poll(() => commands.length).toBe(3);
  await tile.getByLabel('ROI Size').fill('5');
  await tile.getByLabel('ROI Size').blur();
  await expect.poll(() => commands.length).toBe(4);
  await tile.getByRole('button', { name: 'Move ROI up' }).click();
  await expect.poll(() => commands.length).toBe(5);
  await tile.getByRole('button', { name: 'Move ROI right' }).click();
  await expect.poll(() => commands.length).toBe(6);

  expect(commands).toEqual([
    { entityId: 'atoms3u_thermal_color_palette', value: 'rainbow' },
    { entityId: 'atoms3u_thermal_overlay_enable', value: true },
    { entityId: 'atoms3u_roi_enabled', value: true },
    { entityId: 'atoms3u_roi_size', value: '5' },
    { entityId: 'atoms3u_roi_center_row', value: 5 },
    { entityId: 'atoms3u_roi_center_column', value: 9 }
  ]);
});

test('camera does not appear on the device-settings page for AtomS3U', async ({ page }) => {
  await page.goto('/device-settings?device=atoms3u-sensor-rig');

  // Camera img pointing to entities API should not be present
  const cameraImgs = page.locator('img[src*="/api/entities/"]');
  await expect(cameraImgs).toHaveCount(0);
  await expect(page.getByText('Palette')).toHaveCount(0);
  await expect(page.getByText('ROI Size')).toHaveCount(0);
});
