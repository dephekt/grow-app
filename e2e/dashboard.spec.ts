import { expect, test, type Page } from '@playwright/test';
import { dashboardSnapshot as snapshot } from './fixtures/dashboard-snapshot';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/snapshot', async (route) => {
    await route.fulfill({ json: snapshot });
  });
  await page.route('**/api/events', async (route) => {
    await route.abort('failed');
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
