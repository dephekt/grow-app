import { expect, test, type Locator, type Page } from '@playwright/test';
import { dashboardSnapshot as snapshot } from './fixtures/dashboard-snapshot';
import { liveSnapshot } from './fixtures/live-snapshot';

const firmwarePackage = {
  schema: 'grow-firmware-package.v1',
  channel: 'stable',
  device: 'atlas-hydro-kit',
  node_id: 'atlas-hydro-monitor',
  project_name: 'stackdrift.atlas-hydro-kit',
  package_owner: 'stackdrift',
  package: 'atlas-hydro-kit',
  version: 'v0.2.0',
  source_sha: '0123456789abcdef0123456789abcdef01234567',
  chip_family: 'ESP32',
  artifact_filenames: ['atlas-hydro-kit.ota.bin', 'atlas-hydro-kit.factory.bin'],
  md5: { 'atlas-hydro-kit.ota.bin': '4a3b8aa1363813d51abb788cfd4c294e' },
  sha256: { 'atlas-hydro-kit.ota.bin': '7711f755d25874261ba889d6c343474b3952fd5f90d8918833d2e375bf8468c2' },
  release_summary: 'Two firmware changes',
  release_url: 'https://github.com/dephekt/grow-fleet/commit/0123456789abcdef'
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/snapshot', async (route) => {
    await route.fulfill({ json: snapshot });
  });
  await page.route('**/api/events', async (route) => {
    await route.abort('failed');
  });
  await page.route('**/api/firmware/devices/*/package**', async (route) => {
    await route.fulfill({ json: { ok: true, channel: 'stable', package: firmwarePackage, listing: null } });
  });
  await page.route('**/api/firmware/devices/*/check', async (route) => {
    await route.fulfill({ json: { ok: true, channel: 'stable', package: firmwarePackage, checkTriggered: true } });
  });
  await page.route('**/api/firmware/devices/*/channel', async (route) => {
    const body = route.request().postData() ? ((route.request().postDataJSON() ?? {}) as { channel?: string }) : {};
    await route.fulfill({
      json: {
        ok: true,
        config: {
          schema: 'grow-firmware-channel.v1',
          nodeId: 'atlas-hydro-monitor',
          channel: body.channel ?? 'stable',
          updatedAt: new Date('2026-06-13T12:00:00Z').toISOString()
        }
      }
    });
  });
  await page.route('**/api/firmware/devices/*/apply', async (route) => {
    await route.fulfill({ json: { ok: true, nodeId: 'atlas-hydro-monitor', channel: 'stable', version: 'v0.2.0', payload: 'INSTALL' } });
  });
});

async function installMockEventSource(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sources: Array<{
      listeners: Map<string, Set<(event: MessageEvent) => void>>;
      emit(type: string, payload: unknown): void;
      close(): void;
    }> = [];

    class MockEventSource {
      listeners = new Map<string, Set<(event: MessageEvent) => void>>();
      onerror: ((event: Event) => void) | null = null;
      url: string;

      constructor(url: string | URL) {
        this.url = String(url);
        sources.push(this);
      }

      addEventListener(type: string, listener: EventListener): void {
        const listeners = this.listeners.get(type) ?? new Set<(event: MessageEvent) => void>();
        listeners.add(listener as (event: MessageEvent) => void);
        this.listeners.set(type, listeners);
      }

      emit(type: string, payload: unknown): void {
        const event = new MessageEvent(type, { data: JSON.stringify(payload) });
        for (const listener of this.listeners.get(type) ?? []) listener(event);
      }

      close(): void {}
    }

    window.EventSource = MockEventSource as unknown as typeof EventSource;
    (window as unknown as { __emitEventSource: (type: string, payload: unknown) => void }).__emitEventSource = (type, payload) => {
      for (const source of sources) source.emit(type, payload);
    };
  });
}

async function dragSliderBy(page: Page, slider: Locator, deltaX: number, beforeRelease?: () => Promise<void>): Promise<void> {
  const box = await slider.boundingBox();
  if (!box) throw new Error('Expected slider to have a bounding box');

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 6 });
  await beforeRelease?.();
  await page.mouse.up();
}

async function centerX(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Expected locator to have a bounding box');
  return box.x + box.width / 2;
}

async function dragSliderTo(page: Page, slider: Locator, targetX: number): Promise<void> {
  const box = await slider.boundingBox();
  if (!box) throw new Error('Expected slider to have a bounding box');

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, startY, { steps: 6 });
  await page.mouse.up();
}

type CapturedCommand = { url: string; body: { value?: unknown; confirm?: unknown } };

async function captureThresholdCommands(page: Page, snapshot: unknown): Promise<CapturedCommand[]> {
  const commands: CapturedCommand[] = [];
  await page.unroute('**/api/snapshot');
  await page.route('**/api/snapshot', async (route) => {
    await route.fulfill({ json: snapshot });
  });
  await page.route('**/api/entities/*/command', async (route) => {
    commands.push({
      url: route.request().url(),
      body: route.request().postDataJSON() as CapturedCommand['body']
    });
    await route.fulfill({ json: { ok: true } });
  });
  return commands;
}

test('renders a scan-focused local HMI dashboard', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'daniel-home' })).toBeVisible();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AtomS3U Sensor Rig' })).toBeVisible();
  await expect(page.getByText('24.8 °C')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Atlas Hydro Monitor' })).toBeVisible();

  const atlas = page.locator('article.device').filter({ has: page.getByRole('heading', { name: 'Atlas Hydro Monitor' }) });
  const keyReadings = atlas.locator('.metric-grid[aria-label="Atlas Hydro Monitor key readings"]');
  await expect(keyReadings.getByText('Water Temp')).toBeVisible();
  await expect(keyReadings.getByText('22.1 °C')).toBeVisible();
  await expect(keyReadings.getByText('Water pH')).toBeVisible();
  await expect(keyReadings.getByText('6.42 pH')).toBeVisible();
  await expect(atlas.getByRole('heading', { name: 'Quick controls' })).toBeVisible();
  await expect(atlas.getByText('Enable pH Circuit')).toBeVisible();
  await expect(atlas.getByRole('link', { name: 'Device settings' })).toHaveAttribute(
    'href',
    '/device-settings?device=atlas-hydro-monitor'
  );

  await expect(atlas.getByText('pH Calibration')).toBeHidden();
  await expect(atlas.getByText('pH Mid Point')).toBeHidden();
  await expect(atlas.getByText('Restart Device')).toBeHidden();
  await expect(atlas.getByText('Uptime')).toBeHidden();
});

test('keeps dashboard metrics live without showing device settings sections', async ({ page }) => {
  await installMockEventSource(page);
  await page.goto('/');

  const atlas = page.locator('article.device').filter({ has: page.getByRole('heading', { name: 'Atlas Hydro Monitor' }) });
  await expect(atlas).toBeVisible();
  await expect(atlas.getByText('pH Calibration')).toBeHidden();

  await page.evaluate(() => {
    (window as unknown as { __emitEventSource: (type: string, payload: unknown) => void }).__emitEventSource('state', {
      type: 'state',
      entityId: 'atlas_water_ph',
      state: {
        value: '6.43',
        updatedAt: new Date('2026-06-13T12:01:00Z').toISOString()
      }
    });
  });

  await expect(atlas.locator('.metric-grid')).toContainText('6.43 pH');
  await expect(atlas.getByText('pH Calibration')).toBeHidden();
});

test('renders device calibration settings from query state', async ({ page }) => {
  await page.goto('/device-settings?device=atlas-hydro-monitor&section=calibration');

  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Atlas Hydro Monitor' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Calibration/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'pH Calibration' })).toBeVisible();
  await expect(page.getByText('pH Mid Point')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  await expect(page.getByText('Restart Device')).toBeHidden();

  const phCalibration = page.locator('details.settings-group').filter({
    has: page.getByRole('heading', { name: 'pH Calibration' })
  });
  await phCalibration.getByRole('heading', { name: 'pH Calibration' }).click();
  await expect(phCalibration.getByText('pH Mid Point')).toBeHidden();
  await phCalibration.getByRole('heading', { name: 'pH Calibration' }).click();
  await expect(phCalibration.getByText('pH Mid Point')).toBeVisible();
});

test('navigates device settings sections and devices with URL state', async ({ page }) => {
  await page.goto('/device-settings?device=atlas-hydro-monitor&section=calibration');

  await page.getByRole('link', { name: /Controls/ }).click();
  await expect(page).toHaveURL(/device=atlas-hydro-monitor&section=controls/);
  await expect(page.getByRole('link', { name: /Controls/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Enable pH Circuit')).toBeVisible();

  await page.getByRole('link', { name: /AtomS3U Sensor Rig/ }).click();
  await expect(page).toHaveURL(/\/device-settings\?device=atoms3u-sensor-rig$/);
  await expect(page.getByRole('heading', { name: 'AtomS3U Sensor Rig' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Alerts/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.rule-card').filter({ hasText: 'CO₂' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'CO₂ high threshold' })).toBeVisible();
  await expect(page.getByText('CO2 High Alert')).toHaveCount(0);
});

test('aggregates high and low alert binary sensors into the alert card status', async ({ page }) => {
  const alertingSnapshot = structuredClone(liveSnapshot);
  alertingSnapshot.states.espbinary_sensorco2_high_alert = {
    value: 'ON',
    updatedAt: new Date('2026-06-13T12:01:00Z').toISOString()
  };
  alertingSnapshot.states.espbinary_sensorco2_low_alert = {
    value: 'OFF',
    updatedAt: new Date('2026-06-13T12:01:00Z').toISOString()
  };

  await page.unroute('**/api/snapshot');
  await page.route('**/api/snapshot', async (route) => {
    await route.fulfill({ json: alertingSnapshot });
  });

  await page.goto('/device-settings?device=atoms3u-sensor-rig&section=alerts');

  const co2Card = page.locator('.rule-card').filter({ hasText: 'CO₂' });
  await expect(co2Card).toBeVisible();
  await expect(co2Card.locator('.status-chip')).toHaveText('HIGH');
  await expect(page.getByText('Other Alerts')).toHaveCount(0);
  await expect(page.getByText('CO2 High Alert')).toHaveCount(0);
  await expect(page.getByText('CO2 Low Alert')).toHaveCount(0);
  await expect(page.getByText('Temperature High Alert')).toHaveCount(0);
  await expect(page.getByText('VPD High Alert')).toHaveCount(0);
});

test('drags an alert threshold handle past its bound and publishes the clamped value', async ({ page }) => {
  const commands = await captureThresholdCommands(page, liveSnapshot);

  await page.goto('/device-settings?device=atoms3u-sensor-rig&section=alerts');

  const co2Card = page.locator('.rule-card').filter({ hasText: 'CO₂' });
  await expect(co2Card).toBeVisible();
  await expect(co2Card.locator('input[type="number"]')).toHaveCount(0);
  await expect(co2Card.getByRole('slider', { name: 'CO₂ low threshold' })).toBeVisible();

  const highThreshold = co2Card.getByRole('slider', { name: 'CO₂ high threshold' });
  const liveMarker = co2Card.locator('.live-marker');
  const highBefore = await centerX(highThreshold);
  const liveBefore = await centerX(liveMarker);

  await dragSliderBy(page, highThreshold, -320, async () => {
    expect(commands).toHaveLength(0);

    await expect.poll(() => centerX(highThreshold)).toBeLessThan(highBefore - 20);
    // The live marker must stay put while the handle drags (frozen band domain).
    await expect.poll(() => centerX(liveMarker)).toBeGreaterThan(liveBefore - 2);
    await expect.poll(() => centerX(liveMarker)).toBeLessThan(liveBefore + 2);
  });

  // -320px overshoots the low end; the high handle clamps to its floor
  // (max(min 500, low 800 + step 50) = 850).
  await expect.poll(() => commands.length).toBe(1);
  expect(commands[0].url).toContain('/api/entities/espnumberco2_high_threshold/command');
  expect(commands[0].body).toMatchObject({ value: 850, confirm: false });
});

test('drags a threshold handle to a scaled mid-range value, not a clamp boundary', async ({ page }) => {
  const commands = await captureThresholdCommands(page, liveSnapshot);

  await page.goto('/device-settings?device=atoms3u-sensor-rig&section=alerts');

  const co2Card = page.locator('.rule-card').filter({ hasText: 'CO₂' });
  await expect(co2Card).toBeVisible();

  const highThreshold = co2Card.getByRole('slider', { name: 'CO₂ high threshold' });
  const band = co2Card.locator('.band-svg');
  const bandBox = await band.boundingBox();
  if (!bandBox) throw new Error('Expected band svg to have a bounding box');

  // The SVG's horizontal centre always maps to band-unit 140 (centre of the 0..280
  // viewBox) regardless of card width or preserveAspectRatio padding, i.e. the domain
  // midpoint 400 + 0.5 * (2000 - 400) = 1200. A clamp-only bug would publish 850/2000;
  // a broken pointer→value scale would publish something else. This exercises the
  // actual pointerBandX / pointerThresholdValue mapping.
  await dragSliderTo(page, highThreshold, bandBox.x + bandBox.width / 2);

  await expect.poll(() => commands.length).toBe(1);
  expect(commands[0].url).toContain('/api/entities/espnumberco2_high_threshold/command');
  expect(commands[0].body).toMatchObject({ value: 1200, confirm: false });
});

test('renders a draggable handle for a writable threshold that has no current state', async ({ page }) => {
  const noState = structuredClone(liveSnapshot);
  // The high threshold never reported a value (e.g. non-retained / device offline at load).
  delete (noState.states as Record<string, unknown>).espnumberco2_high_threshold;

  const commands = await captureThresholdCommands(page, noState);

  await page.goto('/device-settings?device=atoms3u-sensor-rig&section=alerts');

  const co2Card = page.locator('.rule-card').filter({ hasText: 'CO₂' });
  await expect(co2Card).toBeVisible();

  // The handle is still present and settable even with no committed value.
  const highThreshold = co2Card.getByRole('slider', { name: 'CO₂ high threshold' });
  await expect(highThreshold).toBeVisible();

  await dragSliderBy(page, highThreshold, -320);

  await expect.poll(() => commands.length).toBe(1);
  expect(commands[0].url).toContain('/api/entities/espnumberco2_high_threshold/command');
  expect(commands[0].body).toMatchObject({ value: 850, confirm: false });
});

test('shows stable firmware update status and applies only when device state matches', async ({ page }) => {
  await page.goto('/device-settings?device=atlas-hydro-monitor');

  const updates = page.getByRole('region', { name: 'Atlas Hydro Monitor firmware updates' });
  await expect(updates.getByRole('heading', { name: 'Firmware updates' })).toBeVisible();
  await expect(updates.getByRole('button', { name: 'Stable' })).toHaveAttribute('aria-pressed', 'true');
  await expect(updates).toContainText('v0.1.0');
  await expect(updates).toContainText('v0.2.0');
  await expect(updates).toContainText('0123456789ab');
  await expect(updates).toContainText('Two firmware changes');
  await expect(updates.getByRole('button', { name: 'Apply' })).toBeEnabled();

  await updates.getByRole('button', { name: 'Apply' }).click();
  await expect(updates).toContainText('Install requested');
});

test('switches firmware channel and triggers device update check', async ({ page }) => {
  await page.goto('/device-settings?device=atlas-hydro-monitor');

  const updates = page.getByRole('region', { name: 'Atlas Hydro Monitor firmware updates' });
  await updates.getByRole('button', { name: 'Edge' }).click();
  await expect(updates.getByRole('button', { name: 'Edge' })).toHaveAttribute('aria-pressed', 'true');

  await updates.getByRole('button', { name: 'Check' }).click();
  await expect(updates).toContainText('Device check requested');
});

test('keeps apply disabled when selected firmware is already installed', async ({ page }) => {
  await page.route('**/api/firmware/devices/*/package**', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        channel: 'stable',
        package: { ...firmwarePackage, version: 'v0.1.0' },
        listing: null
      }
    });
  });

  await page.goto('/device-settings?device=atlas-hydro-monitor');

  const updates = page.getByRole('region', { name: 'Atlas Hydro Monitor firmware updates' });
  await expect(updates.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await expect(updates).toContainText('No update');
  await expect(updates).not.toContainText('Two firmware changes');

  await page.route('**/api/firmware/devices/*/check', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        channel: 'stable',
        package: { ...firmwarePackage, version: 'v0.1.0' },
        listing: null,
        checkTriggered: false
      }
    });
  });

  await updates.getByRole('button', { name: 'Check' }).click();
  await expect(updates).toContainText('No new package available');
  await expect(updates).not.toContainText('Device check requested');
});

test('shows no-package status without reporting a device check', async ({ page }) => {
  await page.route('**/api/firmware/devices/*/package**', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        channel: 'stable',
        package: null,
        listing: null
      }
    });
  });
  await page.route('**/api/firmware/devices/*/check', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        channel: 'stable',
        package: null,
        listing: null,
        checkTriggered: false
      }
    });
  });

  await page.goto('/device-settings?device=atlas-hydro-monitor');

  const updates = page.getByRole('region', { name: 'Atlas Hydro Monitor firmware updates' });
  await expect(updates.locator('.version-grid')).toContainText('No package');

  await updates.getByRole('button', { name: 'Check' }).click();
  await expect(updates).toContainText('No new package available');
  await expect(updates).not.toContainText('No stable package available');
  await expect(updates).not.toContainText('Device check requested');
  await expect(updates.getByRole('button', { name: 'Check' })).toBeEnabled();
});

test('shows bootstrap state before firmware metadata and update entities exist', async ({ page }) => {
  await page.goto('/device-settings?device=atoms3u-sensor-rig');

  const updates = page.getByRole('region', { name: 'AtomS3U Sensor Rig firmware updates' });
  await expect(updates).toContainText('Bootstrap required');
  await expect(updates.getByRole('button', { name: 'Apply' })).toHaveCount(0);
});

test('blocks apply until the device-side latest version matches the package', async ({ page }) => {
  const stale = structuredClone(snapshot);
  stale.states.atlas_firmware_update = {
    value: JSON.stringify({
      state: 'ON',
      installed_version: 'v0.1.0',
      latest_version: 'v0.3.0'
    }),
    updatedAt: new Date('2026-06-13T12:00:00Z').toISOString()
  };
  await page.route('**/api/snapshot', async (route) => {
    await route.fulfill({ json: stale });
  });

  await page.goto('/device-settings?device=atlas-hydro-monitor');

  const updates = page.getByRole('region', { name: 'Atlas Hydro Monitor firmware updates' });
  await expect(updates.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await expect(updates).toContainText('Run Check first');
});
