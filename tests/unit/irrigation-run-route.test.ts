// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '$lib/server/auth/users';
import { readJson } from './http';

type RunBody = { seconds: number };
type ErrorBody = { error: string };

// irrigation-routes.test.ts runs this handler with OpenSprinkler DISABLED, where it
// short-circuits to 503 before resolving anything. Shot resolution is the half that guard
// hides, and it is the half that reads an unvalidated body.
beforeAll(() => {
  process.env.GROW_IRRIGATION_DB = ':memory:';
});

vi.mock('$lib/server/opensprinkler/config', () => ({
  getOpenSprinklerConfig: () => ({
    enabled: true,
    baseTopic: 'grow/test/os',
    discoveryPrefix: 'homeassistant'
  })
}));

const runs: Array<{ sid: number; seconds: number }> = [];

// Stubbed rather than driven through the real controller: runStation arms a watchdog timer,
// and what these assert is the request body arriving at it intact.
vi.mock('$lib/server/opensprinkler/controller', () => ({
  getIrrigationController: () => ({
    runStation: (sid: number, seconds: number) => {
      runs.push({ sid, seconds });
      return Promise.resolve();
    }
  })
}));

const { POST: RUN } = await import('../../src/routes/api/irrigation/zones/[id]/run/+server');
const { getIrrigationDb } = await import('../../src/lib/server/opensprinkler/db');
const { createZone } = await import('../../src/lib/server/opensprinkler/zones');

const admin: AuthenticatedUser = {
  id: 1,
  username: 'dan',
  displayName: null,
  isAdmin: true,
  hasLocalPassword: true,
  oidcLinked: false
};

function run(id: string, body: unknown) {
  const request = new Request('http://localhost/api/irrigation/zones/z/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const event = { request, locals: { user: admin }, params: { id } };
  return RUN(event as unknown as Parameters<typeof RUN>[0]);
}

/** 2 drippers x 2 L/hr = 66.67 mL/min, 4000 mL substrate — the same spec the shot-math unit
 *  tests use, so a percent shot here resolves to the seconds they already pin. */
function zoneId(): string {
  return createZone(getIrrigationDb(), {
    name: 'Tent 1',
    stationSid: 4,
    substrateVolumeMl: 4000,
    drippers: 2,
    emitterLph: 2,
    maxRunSeconds: 300
  }).id;
}

beforeEach(() => {
  runs.length = 0;
  getIrrigationDb().exec('DELETE FROM zones');
});

describe('POST /api/irrigation/zones/[id]/run', () => {
  it('runs a numeric seconds shot', async () => {
    const res = await run(zoneId(), { seconds: 30 });
    expect(res.status).toBe(200);
    expect((await readJson<RunBody>(res)).seconds).toBe(30);
    expect(runs).toEqual([{ sid: 4, seconds: 30 }]);
  });

  it('runs a string seconds shot, because request.json() is what supplies it', async () => {
    // The reason resolveShotSeconds coerces at all. Typing its input as `number` made this
    // read as a redundant conversion, and deleting it would have turned this run into a 400.
    const res = await run(zoneId(), { seconds: '30' });
    expect(res.status).toBe(200);
    expect((await readJson<RunBody>(res)).seconds).toBe(30);
    expect(runs).toEqual([{ sid: 4, seconds: 30 }]);
  });

  it('compiles a string percent shot through the zone spec', async () => {
    const res = await run(zoneId(), { percent: '3' });
    expect(res.status).toBe(200);
    expect((await readJson<RunBody>(res)).seconds).toBe(108);
  });

  it('rejects a non-scalar rather than letting Number() invent a duration', async () => {
    // Number([30]) is 30 and Number(true) is 1: both used to open a valve.
    const id = zoneId();
    for (const seconds of [[30], true, {}, null]) {
      const res = await run(id, { seconds });
      expect(res.status).toBe(400);
      expect((await readJson<ErrorBody>(res)).error).toMatch(/positive number|one of/);
    }
    expect(runs).toEqual([]);
  });

  it('never records a shot size the resolver would have rejected', async () => {
    // The audit row is written from the raw body, not from what resolveShotSeconds used, so it
    // coerced separately and could claim a 500 mL shot for a run that was 30 seconds of nothing
    // of the sort. Both sides read the same definition of a number now.
    const id = zoneId();
    const res = await run(id, { seconds: 30, ml: [500] });
    expect(res.status).toBe(200);
    const row = getIrrigationDb()
      .prepare('SELECT seconds, requested_ml FROM irrigation_events WHERE zone_id = ?')
      .get(id);
    expect(row).toMatchObject({ seconds: 30, requested_ml: null });
  });

  it('clamps to the zone max-run cap', async () => {
    const res = await run(zoneId(), { seconds: '9000' });
    expect(res.status).toBe(200);
    expect(runs).toEqual([{ sid: 4, seconds: 300 }]);
  });
});
