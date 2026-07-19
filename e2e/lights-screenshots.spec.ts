import { expect, test } from '@playwright/test';
import { liveSnapshot } from './fixtures/live-snapshot';
import glData from './fixtures/grow-light-data.json' assert { type: 'json' };

// A grow-light controller (GP8413 DAC) + logical light, injected so the merged Lights page shows
// the full control + calibrated PPFD. The base fixture has no lights, so we add one here.
const ent = (over: Record<string, unknown>) => ({
  uniqueId: String(over.id),
  device: { identifiers: ['grow-light'], name: 'Grow Light' },
  payloadAvailable: 'online',
  payloadNotAvailable: 'offline',
  dangerous: false,
  writable: false,
  raw: {},
  nodeId: 'grow-light',
  ...over
});

const glEntities = [
  ent({ id: 'gl-power', component: 'switch', name: 'Power', objectId: 'power', payloadOn: 'ON', payloadOff: 'OFF', writable: true }),
  ent({ id: 'gl-dim', component: 'number', name: 'Brightness', objectId: 'brightness', unit: '%', min: 0, max: 100, step: 1, writable: true }),
  ent({ id: 'gl-on', component: 'text', name: 'On time', objectId: 'on_time', writable: true }),
  ent({ id: 'gl-off', component: 'text', name: 'Off time', objectId: 'off_time', writable: true }),
  ent({ id: 'gl-arm', component: 'switch', name: 'Schedule', objectId: 'schedule', payloadOn: 'ON', payloadOff: 'OFF', writable: true }),
  ent({ id: 'gl-load', component: 'sensor', name: 'Load', objectId: 'load', unit: 'W', deviceClass: 'power' })
];

const glDevice = {
  id: 'grow-light',
  nodeId: 'grow-light',
  name: 'Grow Light',
  model: 'GP8413 DAC',
  availability: 'online',
  entityIds: glEntities.map((e) => e.id)
};

const glLight = {
  id: 'grow-light',
  name: 'Grow Light',
  type: 'LED · DAC',
  order: 0,
  roles: {
    power: { node: 'grow-light', objectId: 'power' },
    dimmer: { node: 'grow-light', objectId: 'brightness' },
    onTime: { node: 'grow-light', objectId: 'on_time' },
    offTime: { node: 'grow-light', objectId: 'off_time' },
    scheduleArm: { node: 'grow-light', objectId: 'schedule' },
    metrics: [{ node: 'grow-light', objectId: 'load' }]
  }
};

// A registered spectrometer device (C12880MA) — one diagnostic entity so it lands in the device list,
// and it's flagged in spectrometerNodeIds so the PPFD calibration tab attaches HERE (not the DAC's host).
const specEntity = {
  id: 'spec-integ',
  uniqueId: 'spectrometer_integration_time',
  component: 'sensor',
  name: 'Integration time',
  objectId: 'integration_time',
  nodeId: 'spectrometer',
  unit: 'µs',
  entityCategory: 'diagnostic',
  device: { identifiers: ['spectrometer'], name: 'Spectrometer', model: 'C12880MA' },
  payloadAvailable: 'online',
  payloadNotAvailable: 'offline',
  dangerous: false,
  writable: false,
  raw: {}
};

const specDevice = {
  id: 'spectrometer',
  nodeId: 'spectrometer',
  name: 'Spectrometer',
  model: 'C12880MA',
  availability: 'online',
  entityIds: ['spec-integ']
};

const now = '2026-07-19T14:32:00.000Z';
const st = (value: string) => ({ value, updatedAt: now });

const snapshot = {
  ...liveSnapshot,
  devices: [...liveSnapshot.devices, glDevice, specDevice],
  entities: [...liveSnapshot.entities, ...glEntities, specEntity],
  states: {
    ...liveSnapshot.states,
    espsensorilluminance: st('4000'),
    'gl-power': st('ON'),
    'gl-dim': st('78'),
    'gl-on': st('06:00:00'),
    'gl-off': st('00:00:00'), // 18/6 — the seedling schedule; matches the seedling plan (no mismatch flag)
    'gl-arm': st('ON'),
    'gl-load': st('375'),
    'spec-integ': st('546895')
  },
  lights: [glLight],
  spectrometerNodeIds: ['spectrometer']
};

const frame = {
  nodeId: 'spectrometer',
  seq: 42,
  integrationUs: glData.integrationUs,
  saturated: false,
  adcBits: glData.adcBits,
  fw: '1.0.0',
  capturedAt: now,
  counts: glData.counts,
  processed: {}
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/snapshot', (route) => route.fulfill({ json: snapshot }));
  await page.route('**/api/events', (route) => route.abort('failed'));
  await page.route('**/api/spectrum/live', (route) => route.fulfill({ json: frame }));
  await page.route('**/api/spectrum/anchor', (route) => route.fulfill({ json: { ok: true, anchors: { lux: glData.anchor } } }));
  await page.route('**/api/spectrum', (route) => route.fulfill({ json: { captures: [] } }));
});

test('lights page — merged spectrum + control + grow plan', async ({ page }, testInfo) => {
  await page.goto('/lights');
  await expect(page.getByText('Live canopy output', { exact: false })).toBeVisible();
  await expect(page.locator('.spd')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`lights-${testInfo.project.name}.png`), fullPage: true });
});

test('spectrometer calibration settings section', async ({ page }, testInfo) => {
  await page.goto('/device-settings?device=spectrometer&section=calibration');
  await expect(page.getByRole('heading', { name: 'Spectrometer' })).toBeVisible();
  await expect(page.getByText('// PPFD calibration', { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`spectrometer-calibration-${testInfo.project.name}.png`), fullPage: true });
});
