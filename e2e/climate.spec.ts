// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { expect, test, type Page } from '@playwright/test';
import { dashboardSnapshot } from './fixtures/dashboard-snapshot';

/**
 * Reads hit the real API — the shipped config, the real decideClimate, the real store — so a
 * regression in any of them fails here. Writes are always mocked: three device projects run in
 * parallel against one server, and a real PATCH from one would change what the others see.
 */

/** A tent well past the top of band, exactly the over-vented state the loop was built to fix. */
const LIVE_STATE = {
  ok: true,
  config: {
    mode: 'active',
    exhaustSource: 'loop',
    rhSource: 'external',
    deadbandKpa: 0.1,
    minOnSeconds: 120,
    minOffSeconds: 300,
    minGainKpa: 0.05,
    ventAlwaysAboveC: 31,
    ventNeverBelowC: 20,
    airVpdOverride: null
  },
  band: { target: 1.0, low: 0.9, high: 1.1 },
  week: 1,
  stage: 'Veg',
  planTarget: 1.0,
  climateRef: { day: { tempC: 28.9, rhPct: 75 }, night: { tempC: 28.9, rhPct: 75 } },
  tent: { tempC: 27.18, rhPct: 63.5 },
  room: { tempC: 25.02, rhPct: 61.4 },
  airVpd: 1.32,
  leafVpd: 1.04,
  lightsOn: true,
  tentNode: 'atoms3u-sensor-rig',
  roomNode: 'feather-air-monitor',
  ventedAirVpd: 1.64,
  exhaust: { present: true, on: true },
  humidifier: { present: false, on: false },
  arms: [
    { objectId: 'fan_cycle', on: false },
    { objectId: 'fan_schedule', on: false }
  ],
  action: { kind: 'exhaust', on: false, reason: 'air VPD 1.32 cleared the 1.10 top of band' }
};

const EVENTS = {
  ok: true,
  events: [
    {
      id: 2,
      ts: '2026-08-14T17:05:00.000Z',
      kind: 'exhaust',
      actuator: 'exhaust',
      on: false,
      reason: 'air VPD 1.32 cleared the 1.10 top of band',
      mode: 'active',
      published: true,
      airVpd: 1.32,
      leafVpd: 1.04,
      target: 1.0,
      bandLow: 0.9,
      bandHigh: 1.1,
      tentTempC: 27.18,
      tentRhPct: 63.5,
      roomTempC: 25.02,
      roomRhPct: 61.4,
      lightsOn: true
    },
    {
      id: 1,
      ts: '2026-08-14T16:00:00.000Z',
      kind: 'blocked',
      actuator: 'exhaust',
      on: true,
      reason: 'air VPD 0.85 below the 0.90 floor of band, but venting predicts only 0.87',
      mode: 'active',
      published: false,
      airVpd: 0.85,
      leafVpd: 0.57,
      target: 1.0,
      bandLow: 0.9,
      bandHigh: 1.1,
      tentTempC: 29.5,
      tentRhPct: 78,
      roomTempC: 24,
      roomRhPct: 92,
      lightsOn: true
    }
  ],
  total: 2,
  limit: 25,
  offset: 0,
  anchorId: 2
};

/** Fail the run rather than silently persisting if a spec ever lets a real PATCH through. */
async function blockWrites(page: Page): Promise<void> {
  await page.route('**/api/climate', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    await route.fulfill({ json: { ...LIVE_STATE, config: { ...LIVE_STATE.config, ...body } } });
  });
}

test.describe('climate page — real API reads', () => {
  test.beforeEach(async ({ page }) => {
    await blockWrites(page);
  });

  test('ships inert: observe mode, fan left to its firmware', async ({ page }) => {
    await page.goto('/climate');

    await expect(page.getByRole('button', { name: 'OBSERVE' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /Arm Exhaust/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: /Arm Exhaust/ })).toContainText('FIRMWARE');
    await expect(page.getByText('Decides and logs every tick, publishes nothing.')).toBeVisible();
  });

  test('cannot arm RH control without a humidifier plug', async ({ page }) => {
    await page.goto('/climate');
    const armRh = page.getByRole('button', { name: /Arm RH Control/ });
    await expect(armRh).toBeDisabled();
    await expect(page.getByText(/No humidifier plug discovered/)).toBeVisible();
  });

  test('shows the cited week target and the book reference beside it', async ({ page }) => {
    await page.goto('/climate');
    await expect(page.getByText('CCI Black Book p.57')).toBeVisible();
    await expect(page.getByText(/week 1 · Veg · target 1\.00/)).toBeVisible();
    await expect(page.getByRole('cell', { name: '28.9 °C' }).first()).toBeVisible();
  });

  test('fails safe with no sensors rather than claiming a reading', async ({ page }) => {
    // No broker in e2e, so the snapshot is empty and the loop must refuse to act.
    await page.goto('/climate');
    await expect(page.getByText('Holding')).toBeVisible();
    await expect(page.getByText(/failing safe/)).toBeVisible();
  });

  test('arming publishes the change and reflects it', async ({ page }) => {
    await page.goto('/climate');
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/climate') && r.method() === 'PATCH'),
      page.getByRole('button', { name: /Arm Exhaust/ }).click()
    ]);
    expect(request.postDataJSON()).toEqual({ exhaustSource: 'loop' });
    await expect(page.getByRole('button', { name: /Arm Exhaust/ })).toContainText('LOOP');
  });

  test('is reachable from the command bar', async ({ page }) => {
    await page.route('**/api/snapshot', (route) => route.fulfill({ json: dashboardSnapshot }));
    await page.route('**/api/events', (route) => route.abort('failed'));
    await page.goto('/');
    await page.getByRole('link', { name: 'CLIMATE' }).click();
    await expect(page).toHaveURL(/\/climate$/);
  });
});

test.describe('climate page — populated state', () => {
  test.beforeEach(async ({ page }) => {
    // Client-side navigation runs the universal load in the browser, so these routes apply.
    await page.route('**/api/climate', async (route) => {
      if (route.request().method() === 'PATCH') {
        const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
        return route.fulfill({ json: { ...LIVE_STATE, config: { ...LIVE_STATE.config, ...body } } });
      }
      await route.fulfill({ json: LIVE_STATE });
    });
    await page.route('**/api/climate/events**', (route) => route.fulfill({ json: EVENTS }));
    await page.route('**/api/snapshot', (route) => route.fulfill({ json: dashboardSnapshot }));
    await page.route('**/api/events', (route) => route.abort('failed'));
  });

  async function open(page: Page): Promise<void> {
    await page.goto('/');
    await page.getByRole('link', { name: 'CLIMATE' }).click();
    await expect(page).toHaveURL(/\/climate$/);
  }

  test('renders the reading, the band and the verdict', async ({ page }) => {
    await open(page);
    await expect(page.getByText('1.32', { exact: true })).toBeVisible();
    await expect(page.getByText('above the hard ceiling')).toBeVisible();
    // exact, because the log row below carries the same words in lower case.
    await expect(page.getByText('Exhaust OFF', { exact: true })).toBeVisible();
    await expect(page.getByText('air VPD 1.32 cleared the 1.10 top of band').first()).toBeVisible();
  });

  test('shows tent and room absolute humidity, which is what venting moves', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('cell', { name: '16.5 g/m³' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '14.2 g/m³' })).toBeVisible();
    await expect(page.getByText(/would settle near/)).toBeVisible();
  });

  test('distinguishes a published decision from a dry-run one in the log', async ({ page }) => {
    await open(page);
    await expect(page.getByText('set exhaust OFF', { exact: true })).toBeVisible();
    await expect(page.getByText('blocked · exhaust ON')).toBeVisible();
    await expect(page.getByText(/venting predicts only 0\.87/)).toBeVisible();
  });

  test('edits a guard through the API', async ({ page }) => {
    await open(page);
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/climate') && r.method() === 'PATCH'),
      page.getByLabel('Deadband ± kPa').fill('0.15').then(() => page.getByLabel('Deadband ± kPa').blur())
    ]);
    expect(request.postDataJSON()).toEqual({ deadbandKpa: 0.15 });
  });
});
