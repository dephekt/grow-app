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

const zones = [
  {
    id: 'z1',
    name: 'Tent 1',
    substrateType: 'Coco',
    substrateNodeId: NODE,
    pwecMin: 0.2,
    pwecMax: 1.2,
    vwcMinPct: 35,
    vwcMaxPct: 65
  }
];

test('pore EC comparison toggles on the substrate card', async ({ page }) => {
  await page.route('**/api/snapshot', (route) => route.fulfill({ json: withProbe }));
  await page.route('**/api/events', (route) => route.abort('failed'));
  await page.route('**/api/irrigation/zones', (route) => route.fulfill({ json: { zones } }));

  await page.goto('/');
  const panel = page.locator('.panel', { hasText: '// SUBSTRATE' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/comparison only/)).toHaveCount(0);

  await panel.getByRole('button', { name: /coir/i }).click();
  await expect(panel.getByText(/comparison only/)).toBeVisible();
  // The committed reading keeps the row; the coir one reads lower beside it.
  await expect(panel.getByText('0.10 mS/cm')).toBeVisible();
  await expect(panel.getByText('0.09 mS/cm')).toBeVisible();

  // It has to survive a reload, or "compare for a while" means re-clicking it every visit.
  await page.reload();
  await expect(panel.getByText(/comparison only/)).toBeVisible();
});

/** A synthetic dryback so the two offsets visibly diverge rather than running parallel. */
function historySeries() {
  const start = Date.parse('2026-08-04T00:00:00Z');
  const at = (i: number) => new Date(start + i * 15 * 60_000).toISOString();
  const pwec: Array<{ t: string; v: number }> = [];
  const coir: Array<{ t: string; v: number }> = [];
  const vwc: Array<{ t: string; v: number }> = [];
  for (let i = 0; i < 96; i += 1) {
    const permittivity = 24 - (i / 95) * 15;
    const bulkEc = 0.9;
    const water = 80.3 - 0.37 * (24 - 20);
    pwec.push({ t: at(i), v: (water * bulkEc) / (permittivity - 4.1) });
    coir.push({ t: at(i), v: (water * bulkEc) / (permittivity - 1.64) });
    vwc.push({ t: at(i), v: 48 - (i / 95) * 18 });
  }
  return [
    { key: 'substrate-a:vwc', label: 'VWC', unit: '%', points: vwc },
    { key: 'substrate-a:pwec', label: 'pwEC', unit: 'mS/cm', points: pwec },
    {
      key: 'substrate-a:pwec-coir',
      label: 'pwEC coir',
      unit: 'mS/cm',
      points: coir,
      compareOf: 'substrate-a:pwec'
    }
  ];
}

test('the substrate chart pairs the comparison with its subject', async ({ page }) => {
  await page.route('**/api/snapshot', (route) => route.fulfill({ json: withProbe }));
  await page.route('**/api/events', (route) => route.abort('failed'));
  await page.route('**/api/irrigation/zones', (route) => route.fulfill({ json: { zones } }));
  await page.route('**/api/history**', (route) =>
    route.fulfill({ json: { configured: true, domain: 'substrate', range: '24h', series: historySeries() } })
  );

  await page.goto('/');
  const trends = page.locator('.trends-panel');
  await trends.getByRole('button', { name: 'Substrate', exact: true }).click();

  // Off by default: the comparison ships in the response but is filtered out of the chart.
  await expect(trends.getByText('pwEC (mS/cm)')).toBeVisible();
  await expect(trends.getByText('pwEC coir (mS/cm)')).toHaveCount(0);

  await trends.getByRole('button', { name: /coir/i }).click();
  await expect(trends.getByText('pwEC coir (mS/cm)')).toBeVisible();
});

test('the comparison toggle is scoped to the substrate domain', async ({ page }) => {
  await page.route('**/api/snapshot', (route) => route.fulfill({ json: withProbe }));
  await page.route('**/api/events', (route) => route.abort('failed'));
  await page.route('**/api/irrigation/zones', (route) => route.fulfill({ json: { zones } }));
  await page.route('**/api/history**', (route) =>
    route.fulfill({ json: { configured: true, domain: 'water', range: '6h', series: [] } })
  );

  await page.goto('/');
  const trends = page.locator('.trends-panel');
  await expect(trends.getByRole('button', { name: /coir/i })).toHaveCount(0);
  await trends.getByRole('button', { name: 'Substrate', exact: true }).click();
  await expect(trends.getByRole('button', { name: /coir/i })).toBeVisible();
});
