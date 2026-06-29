import { readFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { liveSnapshot } from './fixtures/live-snapshot';

// Real thermal frame captured from the live site (see scripts/capture-fixture.sh).
const THERMAL_JPG = readFileSync('e2e/fixtures/thermal.jpg');

function makePoints(base: number, n = 120) {
  const start = Date.now() - n * 3 * 60 * 1000;
  return Array.from({ length: n }, (_, i) => ({
    t: new Date(start + i * 3 * 60 * 1000).toISOString(),
    v: base + Math.sin(i / 7) * base * 0.06 + (i % 9) * base * 0.003
  }));
}

const DOMAIN_SERIES: Record<string, Array<[string, string, string, number]>> = {
  water: [
    ['water_temperature', 'Temp', '°C', 24],
    ['water_ph', 'pH', 'pH', 6.2],
    ['water_ec', 'EC', 'µS/cm', 1200],
    ['water_tds', 'TDS', 'ppm', 600],
    ['water_orp', 'ORP', 'mV', 150]
  ],
  climate: [
    ['temperature', 'Temperature', '°C', 24],
    ['humidity', 'Humidity', '%', 59],
    ['co2', 'CO2', 'ppm', 760],
    ['vpd', 'VPD', 'kPa', 1.2],
    ['barometric_pressure', 'Pressure', 'hPa', 990],
    ['illuminance', 'Illuminance', 'lx', 60]
  ],
  thermal: [
    ['mlx90640_min_temp', 'Min', '°C', 21],
    ['mlx90640_mean_temp', 'Mean', '°C', 24],
    ['mlx90640_max_temp', 'Max', '°C', 31]
  ],
  substrate: []
};

test.beforeEach(async ({ page }) => {
  // The captured live snapshot (~130 real entities, both devices).
  await page.route('**/api/snapshot', (route) => route.fulfill({ json: liveSnapshot }));
  await page.route('**/api/events', (route) => route.abort('failed'));
  await page.route('**/api/history**', (route) => {
    const u = new URL(route.request().url());
    const domain = u.searchParams.get('domain') ?? 'water';
    const specs = DOMAIN_SERIES[domain] ?? [];
    route.fulfill({
      json: {
        configured: true,
        domain,
        range: u.searchParams.get('range') ?? '6h',
        series: specs.map(([key, label, unit, base]) => ({ key, label, unit, points: makePoints(base) }))
      }
    });
  });
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
