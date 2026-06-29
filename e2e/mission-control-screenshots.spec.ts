import { readFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { liveSnapshot } from './fixtures/live-snapshot';

// Real thermal frame captured from the live site (see scripts/capture-fixture.sh).
const THERMAL_JPG = readFileSync('e2e/fixtures/thermal.jpg');

function makeSeries(key: string, label: string, color: string, base: number, n = 80) {
  const start = Date.now() - n * 5 * 60 * 1000;
  const points = Array.from({ length: n }, (_, i) => ({
    t: new Date(start + i * 5 * 60 * 1000).toISOString(),
    v: base + Math.sin(i / 6) * base * 0.05 + (i % 7) * base * 0.004
  }));
  return { key, label, color, node: 'x', entity: 'y', points };
}

test.beforeEach(async ({ page }) => {
  // The captured live snapshot (~130 real entities, both devices).
  await page.route('**/api/snapshot', (route) => route.fulfill({ json: liveSnapshot }));
  await page.route('**/api/events', (route) => route.abort('failed'));
  await page.route('**/api/history**', (route) =>
    route.fulfill({
      json: {
        configured: true,
        range: '6h',
        series: [
          makeSeries('ph', 'pH', 'amber', 6.2),
          makeSeries('air_temp', 'Air °C', 'cyan', 23.8),
          makeSeries('co2', 'CO₂', 'muted', 760)
        ]
      }
    })
  );
  await page.route('**/api/entities/**/image**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/jpeg', body: THERMAL_JPG })
  );
  await page.route('**/api/firmware/devices/**/package**', (route) => route.fulfill({ json: { package: null } }));
});

test('dashboard', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForTimeout(900);
  await page.screenshot({ path: testInfo.outputPath(`dashboard-${testInfo.project.name}.png`), fullPage: true });
});

test('device-settings-calibration', async ({ page }, testInfo) => {
  await page.goto('/device-settings?device=atlas-hydro-monitor&section=calibration');
  await page.waitForTimeout(900);
  await page.screenshot({
    path: testInfo.outputPath(`device-settings-calibration-${testInfo.project.name}.png`),
    fullPage: true
  });
});

test('device-settings-alerts', async ({ page }, testInfo) => {
  await page.goto('/device-settings?device=atoms3u-sensor-rig&section=alerts');
  await page.waitForTimeout(900);
  await page.screenshot({
    path: testInfo.outputPath(`device-settings-alerts-${testInfo.project.name}.png`),
    fullPage: true
  });
});

test('device-settings-controls', async ({ page }, testInfo) => {
  await page.goto('/device-settings?device=atlas-hydro-monitor&section=controls');
  await page.waitForTimeout(900);
  await page.screenshot({
    path: testInfo.outputPath(`device-settings-controls-${testInfo.project.name}.png`),
    fullPage: true
  });
});

test('device-settings-updates', async ({ page }, testInfo) => {
  await page.goto('/device-settings?device=atlas-hydro-monitor&section=updates');
  await page.waitForTimeout(900);
  await page.screenshot({
    path: testInfo.outputPath(`device-settings-updates-${testInfo.project.name}.png`),
    fullPage: true
  });
});
