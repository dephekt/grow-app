// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { expect, test } from '@playwright/test';
import type { Snapshot } from '../src/lib/server/mqtt/types';

const probeEntity = {
  id: 'substrate_a_substrate_raw_counts',
  component: 'sensor',
  name: 'Substrate Raw Counts',
  uniqueId: 'substrate_a_substrate_raw_counts',
  objectId: 'substrate_raw_counts',
  nodeId: 'substrate-a',
  device: {
    identifiers: ['substrate-a'],
    name: 'Substrate A',
    manufacturer: 'METER Group',
    model: 'TEROS 12'
  },
  unit: '',
  payloadAvailable: 'online',
  payloadNotAvailable: 'offline',
  dangerous: false,
  writable: false,
  raw: {}
};

const snapshot: Snapshot = {
  site: 'daniel-home',
  timezone: 'UTC',
  topicPrefix: 'grow/daniel-home',
  discoveryPrefix: 'grow/daniel-home/_discovery',
  generatedAt: '2026-08-10T12:00:00.000Z',
  broker: {
    connected: true,
    connecting: false,
    error: null,
    lastConnectedAt: '2026-08-10T12:00:00.000Z',
    lastMessageAt: '2026-08-10T12:00:00.000Z'
  },
  devices: [
    {
      id: 'substrate-a',
      nodeId: 'substrate-a',
      name: 'Substrate A',
      manufacturer: 'METER Group',
      model: 'TEROS 12',
      availability: 'online',
      entityIds: [probeEntity.id]
    }
  ],
  entities: [probeEntity],
  states: {
    [probeEntity.id]: { value: '2861.35', updatedAt: '2026-08-10T12:00:00.000Z' }
  },
  uiConfigs: {},
  lights: [],
  firmware: { devices: {}, channels: {} }
};

const zone = {
  id: 'zone-1',
  name: 'North Bed',
  stationSid: 0,
  stationEntityId: 'opensprinkler_station_0',
  substrateType: 'Coco',
  substrateVolumeMl: 4000,
  drippers: 2,
  emitterLph: 2,
  maxRunSeconds: 300,
  vwcMinPct: 35,
  vwcMaxPct: 55,
  substrateTempMinC: 18,
  substrateTempMaxC: 26,
  pwecMin: 1.2,
  pwecMax: 2.5,
  enabled: true,
  schedulesPaused: false,
  createdAt: '2026-08-10T12:00:00.000Z',
  updatedAt: '2026-08-10T12:00:00.000Z'
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/snapshot', (route) => route.fulfill({ json: snapshot }));
  await page.route('**/api/events', (route) => route.abort('failed'));
  await page.route('**/api/irrigation/zones', (route) =>
    route.fulfill({ json: { zones: [zone], probes: [{ nodeId: 'substrate-a', zoneId: zone.id, name: 'Gelato A' }] } })
  );
  await page.route('**/api/irrigation/schedules', (route) =>
    route.fulfill({ json: { schedules: [], tz: 'America/Chicago' } })
  );
  await page.route('**/api/irrigation/events', (route) => route.fulfill({ json: { events: [] } }));
});

test('places probes with zones and reveals the shared zone editor above history', async ({ page }, testInfo) => {
  await page.goto('/irrigation');

  const zoneCard = page.locator('article.zone');
  const probes = page.locator('.zones > .probes');
  const history = page.locator('.history');
  const addZone = page.locator('header').getByRole('button', { name: 'Add zone' });

  await expect(zoneCard).toBeVisible();
  await expect(probes).toContainText('Substrate probes');
  await expect(probes).toContainText('Gelato A');
  await expect(history).toBeVisible();

  const zoneBox = await zoneCard.boundingBox();
  const probeBox = await probes.boundingBox();
  const historyBox = await history.boundingBox();
  expect(zoneBox).not.toBeNull();
  expect(probeBox).not.toBeNull();
  expect(historyBox).not.toBeNull();
  if (testInfo.project.name === 'phone') {
    expect(probeBox!.y).toBeGreaterThan(zoneBox!.y);
  } else {
    expect(probeBox!.x).toBeGreaterThan(zoneBox!.x);
  }
  expect(historyBox!.y).toBeGreaterThan(probeBox!.y);

  await expect(addZone).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#zone-editor')).toHaveCount(0);

  await addZone.click();
  const editor = page.locator('#zone-editor');
  await expect(addZone).toHaveAttribute('aria-expanded', 'true');
  await expect(editor).toContainText('Add zone');
  await expect(editor.getByLabel('Name')).toHaveValue('');
  expect((await editor.boundingBox())!.y).toBeLessThan((await history.boundingBox())!.y);

  await editor.getByRole('button', { name: 'Cancel' }).click();
  await expect(editor).toHaveCount(0);
  await expect(addZone).toHaveAttribute('aria-expanded', 'false');

  await zoneCard.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(editor).toContainText('Edit zone');
  await expect(editor.getByLabel('Name')).toHaveValue('North Bed');
  expect((await editor.boundingBox())!.y).toBeLessThan((await history.boundingBox())!.y);
});

test('scrolls a newly revealed zone editor into view below a long zone grid', async ({ page }) => {
  const manyZones = Array.from({ length: 12 }, (_, index) => ({
    ...zone,
    id: `zone-${index + 1}`,
    name: `Bed ${index + 1}`,
    stationSid: index,
    stationEntityId: `opensprinkler_station_${index}`
  }));
  await page.unroute('**/api/irrigation/zones');
  await page.route('**/api/irrigation/zones', (route) =>
    route.fulfill({
      json: { zones: manyZones, probes: [{ nodeId: 'substrate-a', zoneId: manyZones[0].id, name: 'Gelato A' }] }
    })
  );
  await page.goto('/irrigation');

  await page.locator('header').getByRole('button', { name: 'Add zone' }).click();

  const editor = page.locator('#zone-editor');
  await expect(editor).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});
