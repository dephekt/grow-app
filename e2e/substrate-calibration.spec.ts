// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { expect, test } from '@playwright/test';
import { liveSnapshot } from './fixtures/live-snapshot';

const NODE = 'substrate-a';

function entity(objectId: string, unit: string) {
  return {
    id: `${NODE}_${objectId}`,
    component: 'sensor',
    name: objectId,
    uniqueId: `${NODE}_${objectId}`,
    objectId,
    nodeId: NODE,
    device: { identifiers: [NODE], name: 'Substrate A', manufacturer: 'METER Group', model: 'TEROS 12' },
    unit,
    payloadAvailable: 'online',
    payloadNotAvailable: 'offline',
    dangerous: false,
    writable: false,
    raw: {}
  };
}

const withProbe = {
  ...liveSnapshot,
  devices: [
    ...liveSnapshot.devices,
    {
      id: NODE,
      nodeId: NODE,
      name: 'Substrate A',
      manufacturer: 'METER Group',
      model: 'TEROS 12',
      availability: 'online',
      entityIds: [`${NODE}_substrate_raw_counts`]
    }
  ],
  entities: [
    ...liveSnapshot.entities,
    entity('substrate_raw_counts', ''),
    entity('substrate_temperature', '°C'),
    entity('substrate_bulk_ec', 'mS/cm')
  ],
  states: {
    ...liveSnapshot.states,
    [`${NODE}_substrate_raw_counts`]: { value: '2861.35', updatedAt: '2026-08-05T00:00:00Z' },
    [`${NODE}_substrate_temperature`]: { value: '26.6', updatedAt: '2026-08-05T00:00:00Z' },
    [`${NODE}_substrate_bulk_ec`]: { value: '0.025', updatedAt: '2026-08-05T00:00:00Z' }
  }
};

const probes = [{ nodeId: NODE, zoneId: 'z1', name: null }];

async function openWithMedium(page: import('@playwright/test').Page, substrateType: 'Coco' | 'Rockwool') {
  const zones = [{ id: 'z1', name: 'Tent 1', substrateType }];
  await page.route('**/api/snapshot', (route) => route.fulfill({ json: withProbe }));
  await page.route('**/api/events', (route) => route.abort('failed'));
  await page.route('**/api/irrigation/zones', (route) => route.fulfill({ json: { zones, probes } }));
  await page.goto('/');
  return page.locator('.panel', { hasText: '// SUBSTRATE' });
}

test('the coco profile uses TEROS soilless VWC and the Lee & Kim offset', async ({ page }) => {
  const panel = await openWithMedium(page, 'Coco');

  await expect(panel).toBeVisible();
  await expect(panel.getByText('0.09 mS/cm')).toBeVisible();
  await expect(panel.getByText(/coco · soilless VWC · ε₀ 1\.64 · from Coco/)).toBeVisible();
});

test('the rockwool profile uses TEROS soilless VWC and the Hilhorst offset', async ({ page }) => {
  const panel = await openWithMedium(page, 'Rockwool');

  await expect(panel).toBeVisible();
  await expect(panel.getByText('0.10 mS/cm')).toBeVisible();
  await expect(panel.getByText(/rockwool · soilless VWC · ε₀ 4\.1 · from Rockwool/)).toBeVisible();
});
