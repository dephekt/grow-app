import { expect, test, type Page } from '@playwright/test';
import { dashboardSnapshot as snapshot } from './fixtures/dashboard-snapshot';

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
  release_url: 'https://codeberg.org/stackdrift/grow-fleet/src/commit/0123456789abcdef'
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
  await expect(page.getByText('CO2 High Threshold')).toBeVisible();
  await expect(page.getByText('CO2 High Alert')).toBeVisible();
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
