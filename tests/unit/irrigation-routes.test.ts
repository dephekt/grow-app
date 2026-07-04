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
  getIrrigationDb().exec('DELETE FROM zones; DELETE FROM irrigation_events;');
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

describe('run/stop with OpenSprinkler disabled', () => {
  it('returns 503 without touching the controller', async () => {
    const zone = await createViaApi({ name: 'Tent 1', stationSid: 0 });
    let res = (await RUN(event({ body: { seconds: 5 }, id: zone.id }) as unknown as Parameters<typeof RUN>[0])) as Response;
    expect(res.status).toBe(503);
    res = (await STOP(event({ id: zone.id }) as unknown as Parameters<typeof STOP>[0])) as Response;
    expect(res.status).toBe(503);
  });
});
