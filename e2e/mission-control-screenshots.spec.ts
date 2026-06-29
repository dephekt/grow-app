import { test } from '@playwright/test';
import { dashboardSnapshot } from './fixtures/dashboard-snapshot';

// 1x1 transparent PNG for the camera tile route.
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

function makeSeries(key: string, label: string, color: string, base: number, n = 80) {
  const start = Date.now() - n * 5 * 60 * 1000;
  const points = Array.from({ length: n }, (_, i) => ({
    t: new Date(start + i * 5 * 60 * 1000).toISOString(),
    v: base + Math.sin(i / 6) * base * 0.05 + (i % 7) * base * 0.004
  }));
  return { key, label, color, node: 'x', entity: 'y', points };
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/snapshot', (route) => route.fulfill({ json: dashboardSnapshot }));
  await page.route('**/api/events', (route) => route.abort('failed'));
  await page.route('**/api/history**', (route) =>
    route.fulfill({
      json: {
        configured: true,
        range: '6h',
        series: [
          makeSeries('ph', 'pH', 'amber', 6.4),
          makeSeries('air_temp', 'Air °C', 'cyan', 24.8),
          makeSeries('co2', 'CO₂', 'muted', 900)
        ]
      }
    })
  );
  await page.route('**/api/entities/**/image**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL_PNG })
  );
});

test('dashboard', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForTimeout(900);
  await page.screenshot({ path: testInfo.outputPath(`dashboard-${testInfo.project.name}.png`), fullPage: true });
});

test('device-settings-calibration', async ({ page }, testInfo) => {
  await page.route('**/api/firmware/devices/**/package**', (route) =>
    route.fulfill({ json: { package: null } })
  );
  await page.goto('/device-settings?device=atlas-hydro-monitor&section=calibration');
  await page.waitForTimeout(900);
  await page.screenshot({
    path: testInfo.outputPath(`device-settings-calibration-${testInfo.project.name}.png`),
    fullPage: true
  });
});

test('device-settings-alerts', async ({ page }, testInfo) => {
  await page.route('**/api/firmware/devices/**/package**', (route) =>
    route.fulfill({ json: { package: null } })
  );
  await page.goto('/device-settings?device=atoms3u-sensor-rig&section=alerts');
  await page.waitForTimeout(900);
  await page.screenshot({
    path: testInfo.outputPath(`device-settings-alerts-${testInfo.project.name}.png`),
    fullPage: true
  });
});

test('device-settings-controls', async ({ page }, testInfo) => {
  await page.route('**/api/firmware/devices/**/package**', (route) => route.fulfill({ json: { package: null } }));
  await page.goto('/device-settings?device=atlas-hydro-monitor&section=controls');
  await page.waitForTimeout(900);
  await page.screenshot({
    path: testInfo.outputPath(`device-settings-controls-${testInfo.project.name}.png`),
    fullPage: true
  });
});

test('device-settings-updates', async ({ page }, testInfo) => {
  await page.route('**/api/firmware/devices/**/package**', (route) => route.fulfill({ json: { package: null } }));
  await page.goto('/device-settings?device=atlas-hydro-monitor&section=updates');
  await page.waitForTimeout(900);
  await page.screenshot({
    path: testInfo.outputPath(`device-settings-updates-${testInfo.project.name}.png`),
    fullPage: true
  });
});
