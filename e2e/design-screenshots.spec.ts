import { expect, test } from '@playwright/test';
import { dashboardSnapshot } from './fixtures/dashboard-snapshot';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/snapshot', async (route) => {
    await route.fulfill({ json: dashboardSnapshot });
  });
  await page.route('**/api/events', async (route) => {
    await route.abort('failed');
  });
});

test('captures current dashboard for Penpot import', async ({ page }, testInfo) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'daniel-home' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Atlas Hydro Monitor' })).toBeVisible();
  await expect(page.locator('.shell')).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath(`grow-app-current-${testInfo.project.name}.png`),
    fullPage: true
  });
});

test('captures device settings references for Penpot import', async ({ page }, testInfo) => {
  await page.goto('/device-settings?device=atlas-hydro-monitor&section=calibration');

  await expect(page.getByRole('heading', { name: 'Atlas Hydro Monitor' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Calibration/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'pH Calibration' })).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath(`grow-app-device-settings-calibration-${testInfo.project.name}.png`),
    fullPage: true
  });

  await page.goto('/device-settings?device=atoms3u-sensor-rig&section=alerts');

  await expect(page.getByRole('heading', { name: 'AtomS3U Sensor Rig' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Alerts/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('CO2 High Threshold')).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath(`grow-app-device-settings-alerts-${testInfo.project.name}.png`),
    fullPage: true
  });
});
