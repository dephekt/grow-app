import { expect, test, type Page } from '@playwright/test';

const snapshot = {
  site: 'daniel-home',
  topicPrefix: 'grow/daniel-home',
  discoveryPrefix: 'grow/daniel-home/_discovery',
  generatedAt: new Date('2026-06-13T12:00:00Z').toISOString(),
  broker: {
    connected: true,
    connecting: false,
    error: null,
    lastConnectedAt: new Date('2026-06-13T11:59:00Z').toISOString(),
    lastMessageAt: new Date('2026-06-13T12:00:00Z').toISOString()
  },
  devices: [
    {
      id: 'atoms3u-sensor-rig',
      nodeId: 'atoms3u-sensor-rig',
      name: 'AtomS3U Sensor Rig',
      manufacturer: 'M5Stack',
      model: 'AtomS3U',
      availability: 'online',
      entityIds: ['atoms3u_temperature']
    },
    {
      id: 'atlas-hydro-monitor',
      nodeId: 'atlas-hydro-monitor',
      name: 'Atlas Hydro Monitor',
      manufacturer: 'Atlas Scientific',
      model: 'Hydro kit',
      availability: 'unknown',
      entityIds: [
        'atlas_water_temperature',
        'atlas_water_ph',
        'atlas_enable_ph_circuit',
        'atlas_ph_cal_mid',
        'atlas_restart',
        'atlas_uptime'
      ]
    }
  ],
  entities: [
    {
      id: 'atoms3u_temperature',
      component: 'sensor',
      name: 'Temperature',
      uniqueId: 'atoms3u_temperature',
      device: { identifiers: ['atoms3u-sensor-rig'], name: 'AtomS3U Sensor Rig' },
      stateTopic: 'grow/daniel-home/atoms3u-sensor-rig/sensor/temperature/state',
      unit: '°C',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: false,
      raw: {}
    },
    {
      id: 'atlas_water_temperature',
      component: 'sensor',
      name: 'Water Temperature',
      uniqueId: 'atlas_water_temperature',
      objectId: 'water_temperature',
      nodeId: 'atlas-hydro-monitor',
      device: { identifiers: ['atlas-hydro-monitor'], name: 'Atlas Hydro Monitor' },
      stateTopic: 'grow/daniel-home/atlas-hydro-monitor/sensor/water_temperature/state',
      unit: '°C',
      deviceClass: 'temperature',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: false,
      raw: {}
    },
    {
      id: 'atlas_water_ph',
      component: 'sensor',
      name: 'Water pH',
      uniqueId: 'atlas_water_ph',
      objectId: 'water_ph',
      nodeId: 'atlas-hydro-monitor',
      device: { identifiers: ['atlas-hydro-monitor'], name: 'Atlas Hydro Monitor' },
      stateTopic: 'grow/daniel-home/atlas-hydro-monitor/sensor/water_ph/state',
      unit: 'pH',
      deviceClass: 'ph',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: false,
      raw: {}
    },
    {
      id: 'atlas_ph_cal_mid',
      component: 'button',
      name: 'pH Cal Mid (7.00)',
      uniqueId: 'atlas_ph_cal_mid',
      objectId: 'ph_cal_mid__7_00_',
      nodeId: 'atlas-hydro-monitor',
      device: { identifiers: ['atlas-hydro-monitor'], name: 'Atlas Hydro Monitor' },
      commandTopic: 'grow/daniel-home/atlas-hydro-monitor/button/ph_cal_mid/command',
      payloadPress: 'PRESS',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: true,
      writable: true,
      raw: {}
    },
    {
      id: 'atlas_enable_ph_circuit',
      component: 'switch',
      name: 'Enable pH Circuit',
      uniqueId: 'atlas_enable_ph_circuit',
      objectId: 'enable_ph_circuit',
      nodeId: 'atlas-hydro-monitor',
      device: { identifiers: ['atlas-hydro-monitor'], name: 'Atlas Hydro Monitor' },
      stateTopic: 'grow/daniel-home/atlas-hydro-monitor/switch/enable_ph_circuit/state',
      commandTopic: 'grow/daniel-home/atlas-hydro-monitor/switch/enable_ph_circuit/command',
      payloadOn: 'ON',
      payloadOff: 'OFF',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: true,
      raw: {}
    },
    {
      id: 'atlas_restart',
      component: 'button',
      name: 'Restart',
      uniqueId: 'atlas_restart',
      objectId: 'restart_device',
      nodeId: 'atlas-hydro-monitor',
      device: { identifiers: ['atlas-hydro-monitor'], name: 'Atlas Hydro Monitor' },
      commandTopic: 'grow/daniel-home/atlas-hydro-monitor/button/restart/command',
      payloadPress: 'PRESS',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: true,
      writable: true,
      raw: {}
    },
    {
      id: 'atlas_uptime',
      component: 'sensor',
      name: 'Uptime',
      uniqueId: 'atlas_uptime',
      objectId: 'uptime',
      nodeId: 'atlas-hydro-monitor',
      device: { identifiers: ['atlas-hydro-monitor'], name: 'Atlas Hydro Monitor' },
      stateTopic: 'grow/daniel-home/atlas-hydro-monitor/sensor/uptime/state',
      entityCategory: 'diagnostic',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: false,
      raw: {}
    }
  ],
  states: {
    atoms3u_temperature: { value: '24.8', updatedAt: new Date('2026-06-13T12:00:00Z').toISOString() },
    atlas_water_temperature: { value: '22.1', updatedAt: new Date('2026-06-13T12:00:00Z').toISOString() },
    atlas_water_ph: { value: '6.42', updatedAt: new Date('2026-06-13T12:00:00Z').toISOString() },
    atlas_enable_ph_circuit: { value: 'ON', updatedAt: new Date('2026-06-13T12:00:00Z').toISOString() },
    atlas_uptime: { value: '1h', updatedAt: new Date('2026-06-13T12:00:00Z').toISOString() }
  },
  uiConfigs: {
    'atlas-hydro-monitor': {
      schema: 'grow-ui.v1',
      nodeId: 'atlas-hydro-monitor',
      groups: [
        { id: 'overview', title: 'Key Readings', order: 0, variant: 'metrics', defaultOpen: true },
        { id: 'controls', title: 'Circuit Controls', order: 20, defaultOpen: true },
        { id: 'ph_cal', title: 'pH Calibration', order: 40, defaultOpen: false },
        { id: 'maintenance', title: 'Maintenance', order: 80, defaultOpen: false }
      ],
      entities: [
        {
          component: 'sensor',
          objectId: 'water_temperature',
          group: 'overview',
          role: 'metric',
          order: 10,
          label: 'Water Temp'
        },
        { component: 'sensor', objectId: 'water_ph', group: 'overview', role: 'metric', order: 20, label: 'Water pH' },
        { component: 'switch', objectId: 'enable_ph_circuit', group: 'controls', order: 10 },
        { component: 'button', objectId: 'ph_cal_mid__7_00_', group: 'ph_cal', order: 10, label: 'pH Mid Point' },
        { component: 'button', objectId: 'restart_device', group: 'maintenance', order: 90, label: 'Restart Device' }
      ]
    }
  }
};

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

test('renders the local HMI on desktop and small screens', async ({ page }) => {
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

  const phCalibration = atlas.locator('details.device-section').filter({ hasText: 'pH Calibration' });
  await expect(phCalibration).not.toHaveAttribute('open', '');
  await expect(phCalibration.getByText('pH Mid Point')).toBeHidden();

  await phCalibration.locator('summary').click();
  await expect(phCalibration).toHaveAttribute('open', '');
  await expect(phCalibration.getByText('pH Mid Point')).toBeVisible();
  await expect(phCalibration.getByRole('button', { name: 'Send' })).toBeVisible();
});

test('keeps manually collapsed default-open sections closed across live updates', async ({ page }) => {
  await installMockEventSource(page);
  await page.goto('/');

  const atlas = page.locator('article.device').filter({ has: page.getByRole('heading', { name: 'Atlas Hydro Monitor' }) });
  await expect(atlas).toBeVisible();

  const controls = atlas.locator('details.device-section').filter({ hasText: 'Circuit Controls' });
  await expect(controls).toHaveAttribute('open', '');
  await expect(controls.getByText('Enable pH Circuit')).toBeVisible();

  await controls.locator('summary').click();
  await expect(controls).not.toHaveAttribute('open', '');
  await expect(controls.getByText('Enable pH Circuit')).toBeHidden();

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
  await expect(controls).not.toHaveAttribute('open', '');
  await expect(controls.getByText('Enable pH Circuit')).toBeHidden();
});
