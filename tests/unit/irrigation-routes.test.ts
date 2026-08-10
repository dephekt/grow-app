// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '$lib/server/auth/users';

// Pin the store to an in-memory DB and leave OpenSprinkler DISABLED (GROW_OS_ENABLED
// unset) so the routes never reach the controller/MQTT client — the run/stop guard
// short-circuits to 503 and zone CRUD skips discovery publishing. Set before importing
// the handlers (they read the config-backed singletons on first call).
beforeAll(() => {
  process.env.GROW_IRRIGATION_DB = ':memory:';
  delete process.env.GROW_OS_ENABLED;
});

const { GET, POST } = await import('../../src/routes/api/irrigation/zones/+server');
const { PATCH, DELETE } = await import('../../src/routes/api/irrigation/zones/[id]/+server');
const { POST: RUN } = await import('../../src/routes/api/irrigation/zones/[id]/run/+server');
const { POST: STOP } = await import('../../src/routes/api/irrigation/zones/[id]/stop/+server');
const { GET: EVENTS_GET } = await import('../../src/routes/api/irrigation/events/+server');
const { PATCH: PROBE_PATCH, DELETE: PROBE_DELETE } = await import(
  '../../src/routes/api/irrigation/probes/[nodeId]/+server'
);
const { getIrrigationDb } = await import('../../src/lib/server/opensprinkler/db');

const admin: AuthenticatedUser = { id: 1, username: 'dan', displayName: null, isAdmin: true, hasLocalPassword: true, oidcLinked: false };
const member: AuthenticatedUser = { ...admin, id: 2, username: 'guest', isAdmin: false };

function event(opts: { body?: unknown; user?: AuthenticatedUser | null; id?: string }) {
  const request = new Request('http://localhost/api/irrigation/zones', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  return {
    request,
    locals: { user: opts.user === undefined ? admin : opts.user },
    params: { id: opts.id ?? '' }
  };
}

async function createViaApi(body: Record<string, unknown>): Promise<{ id: string; name: string; stationEntityId: string }> {
  const res = (await POST(event({ body, user: admin }) as unknown as Parameters<typeof POST>[0])) as Response;
  return (await res.json()).zone;
}

beforeEach(() => {
  getIrrigationDb().exec('DELETE FROM substrate_probes; DELETE FROM zones; DELETE FROM irrigation_events;');
});

describe('/api/irrigation/zones', () => {
  it('lists zones (empty, then reflects created ones)', async () => {
    let res = (await GET(event({}) as unknown as Parameters<typeof GET>[0])) as Response;
    expect((await res.json()).zones).toEqual([]);

    await createViaApi({ name: 'Tent 1', stationSid: 0 });
    res = (await GET(event({}) as unknown as Parameters<typeof GET>[0])) as Response;
    expect((await res.json()).zones).toHaveLength(1);
  });

  it('gates create behind admin (401 anon, 403 non-admin)', async () => {
    let res = (await POST(event({ body: { name: 'X', stationSid: 0 }, user: null }) as unknown as Parameters<typeof POST>[0])) as Response;
    expect(res.status).toBe(401);
    res = (await POST(event({ body: { name: 'X', stationSid: 0 }, user: member }) as unknown as Parameters<typeof POST>[0])) as Response;
    expect(res.status).toBe(403);
  });

  it('validates the create body', async () => {
    const res = (await POST(event({ body: { stationSid: 0 }, user: admin }) as unknown as Parameters<typeof POST>[0])) as Response;
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/name/);
  });

  it('creates a zone and returns its derived station entity id', async () => {
    const res = (await POST(event({ body: { name: 'Tent 1', stationSid: 3 }, user: admin }) as unknown as Parameters<typeof POST>[0])) as Response;
    expect(res.status).toBe(201);
    const zone = (await res.json()).zone;
    expect(zone.name).toBe('Tent 1');
    expect(zone.stationEntityId).toBe('opensprinkler_station_3');
  });

  it('409s a second zone that reuses a station', async () => {
    await createViaApi({ name: 'Tent 1', stationSid: 0 });
    const res = (await POST(event({ body: { name: 'Tent 2', stationSid: 0 }, user: admin }) as unknown as Parameters<typeof POST>[0])) as Response;
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/station 0/i);
  });
});

describe('/api/irrigation/events', () => {
  function insertEvents(count: number): void {
    const insert = getIrrigationDb().prepare(
      `INSERT INTO irrigation_events (kind, station_sid, source, seconds, ts)
       VALUES ('irrigation', ?, 'manual', 30, ?)`
    );
    for (let i = 0; i < count; i++) insert.run(i, `2026-08-10T10:${String(i).padStart(2, '0')}:00.000Z`);
  }

  const getEvents = (query = '') =>
    EVENTS_GET({ url: new URL(`http://localhost/api/irrigation/events${query}`) } as Parameters<typeof EVENTS_GET>[0]) as Response;

  it('defaults to the newest 25 rows and reports the full count', async () => {
    insertEvents(30);
    const body = await getEvents().json();
    expect(body).toMatchObject({ total: 30, limit: 25, offset: 0, anchorId: expect.any(Number) });
    expect(body.events).toHaveLength(25);
    expect(body.events[0].stationSid).toBe(29);
    expect(body.events[24].stationSid).toBe(5);
  });

  it('holds an offset page at its anchor and clamps invalid pagination values', async () => {
    insertEvents(30);
    const firstPage = await getEvents().json();
    getIrrigationDb()
      .prepare(
        `INSERT INTO irrigation_events (kind, station_sid, source, seconds, ts)
         VALUES ('irrigation', 99, 'manual', 30, '2026-08-10T11:00:00.000Z')`
      )
      .run();

    let body = await getEvents(`?limit=5&offset=25&anchorId=${firstPage.anchorId}`).json();
    expect(body).toMatchObject({ total: 30, limit: 5, offset: 25 });
    expect(body.events.map((event: { stationSid: number }) => event.stationSid)).toEqual([4, 3, 2, 1, 0]);

    body = await getEvents('?limit=0&offset=-1&anchorId=999999').json();
    expect(body).toMatchObject({ limit: 25, offset: 0, anchorId: expect.any(Number) });
    expect(body.anchorId).toBeLessThan(999999);
  });
});

describe('/api/irrigation/zones/[id]', () => {
  it('404s an unknown zone and gates behind admin', async () => {
    let res = (await PATCH(event({ body: { name: 'X' }, id: 'nope' }) as unknown as Parameters<typeof PATCH>[0])) as Response;
    expect(res.status).toBe(404);
    res = (await DELETE(event({ id: 'nope', user: member }) as unknown as Parameters<typeof DELETE>[0])) as Response;
    expect(res.status).toBe(403);
  });

  it('updates and deletes an existing zone', async () => {
    const zone = await createViaApi({ name: 'Tent 1', stationSid: 0 });
    let res = (await PATCH(event({ body: { name: 'Tent A' }, id: zone.id }) as unknown as Parameters<typeof PATCH>[0])) as Response;
    expect(res.status).toBe(200);
    expect((await res.json()).zone.name).toBe('Tent A');

    res = (await DELETE(event({ id: zone.id }) as unknown as Parameters<typeof DELETE>[0])) as Response;
    expect(res.status).toBe(200);

    res = (await DELETE(event({ id: zone.id }) as unknown as Parameters<typeof DELETE>[0])) as Response;
    expect(res.status).toBe(404);
  });
});

describe('/api/irrigation/probes/[nodeId]', () => {
  function probeEvent(opts: { body?: unknown; user?: AuthenticatedUser | null; nodeId?: string }) {
    return {
      request: new Request('http://localhost/api/irrigation/probes/substrate-a', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
      }),
      locals: { user: opts.user === undefined ? admin : opts.user },
      params: { nodeId: opts.nodeId ?? 'substrate-a' }
    };
  }
  const patch = (opts: Parameters<typeof probeEvent>[0]) =>
    PROBE_PATCH(probeEvent(opts) as unknown as Parameters<typeof PROBE_PATCH>[0]) as Promise<Response>;

  it('gates behind admin (401 anon, 403 non-admin)', async () => {
    expect((await patch({ body: { name: 'Gelato A' }, user: null })).status).toBe(401);
    expect((await patch({ body: { name: 'Gelato A' }, user: member })).status).toBe(403);
  });

  it('404s a zone that does not exist rather than tripping the foreign key', async () => {
    expect((await patch({ body: { zoneId: 'nope' } })).status).toBe(404);
  });

  it('rejects a body that names no field, so no all-null row is conjured', async () => {
    expect((await patch({ body: {} })).status).toBe(400);
    expect(((await (await GET(event({}) as unknown as Parameters<typeof GET>[0])).json()) as { probes: unknown[] }).probes).toEqual([]);
  });

  it('binds a probe, renames it without unbinding, and lists it beside the zones', async () => {
    const zone = await createViaApi({ name: 'Tent 1', stationSid: 0 });
    expect((await patch({ body: { zoneId: zone.id } })).status).toBe(200);
    expect((await (await patch({ body: { name: 'Gelato A' } })).json()).probe).toMatchObject({
      nodeId: 'substrate-a',
      zoneId: zone.id,
      name: 'Gelato A'
    });

    const listed = (await (await GET(event({}) as unknown as Parameters<typeof GET>[0])).json()) as {
      probes: { nodeId: string; zoneId: string | null }[];
    };
    expect(listed.probes).toHaveLength(1);
    expect(listed.probes[0]).toMatchObject({ nodeId: 'substrate-a', zoneId: zone.id });
  });

  it('gates delete behind admin and reports whether a row went', async () => {
    const del = (user?: AuthenticatedUser | null) =>
      PROBE_DELETE(probeEvent({ user }) as unknown as Parameters<typeof PROBE_DELETE>[0]) as Promise<Response>;
    expect((await del(member)).status).toBe(403);
    expect((await (await del()).json()).deleted).toBe(false);
    await patch({ body: { name: 'Gelato A' } });
    expect((await (await del()).json()).deleted).toBe(true);
  });
});

describe('run/stop with OpenSprinkler disabled', () => {
  it('returns 503 without touching the controller', async () => {
    const zone = await createViaApi({ name: 'Tent 1', stationSid: 0 });
    let res = (await RUN(event({ body: { seconds: 5 }, id: zone.id }) as unknown as Parameters<typeof RUN>[0])) as Response;
    expect(res.status).toBe(503);
    res = (await STOP(event({ id: zone.id }) as unknown as Parameters<typeof STOP>[0])) as Response;
    expect(res.status).toBe(503);
  });
});
