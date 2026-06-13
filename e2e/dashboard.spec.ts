import { expect, test } from '@playwright/test';

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
      name: 'AtomS3U Sensor Rig',
      manufacturer: 'M5Stack',
      model: 'AtomS3U',
      availability: 'online',
      entityIds: ['atoms3u_temperature']
    },
    {
      id: 'atlas-hydro-monitor',
      name: 'Atlas Hydro Monitor',
      manufacturer: 'Atlas Scientific',
      model: 'Hydro kit',
      availability: 'unknown',
      entityIds: ['atlas_restart']
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
      id: 'atlas_restart',
      component: 'button',
      name: 'Restart',
      uniqueId: 'atlas_restart',
      device: { identifiers: ['atlas-hydro-monitor'], name: 'Atlas Hydro Monitor' },
      commandTopic: 'grow/daniel-home/atlas-hydro-monitor/button/restart/command',
      payloadPress: 'PRESS',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: true,
      writable: true,
      raw: {}
    }
  ],
  states: {
    atoms3u_temperature: { value: '24.8', updatedAt: new Date('2026-06-13T12:00:00Z').toISOString() }
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

test('renders the local HMI on desktop and small screens', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'daniel-home' })).toBeVisible();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AtomS3U Sensor Rig' })).toBeVisible();
  await expect(page.getByText('24.8 °C')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Atlas Hydro Monitor' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
});
