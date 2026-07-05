import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '$lib/server/auth/users';

// In-memory DB, OpenSprinkler DISABLED — schedule CRUD never touches the controller,
// so the routes exercise purely against the store. Set before importing the handlers
// (they read the config-backed singletons on first call).
beforeAll(() => {
  process.env.GROW_IRRIGATION_DB = ':memory:';
  delete process.env.GROW_OS_ENABLED;
});

const { GET, POST } = await import('../../src/routes/api/irrigation/schedules/+server');
const { PATCH, DELETE } = await import('../../src/routes/api/irrigation/schedules/[id]/+server');
const { POST: ZONE_POST } = await import('../../src/routes/api/irrigation/zones/+server');
const { DELETE: ZONE_DELETE } = await import('../../src/routes/api/irrigation/zones/[id]/+server');
const { getIrrigationDb } = await import('../../src/lib/server/opensprinkler/db');

const admin: AuthenticatedUser = { id: 1, username: 'dan', displayName: null, isAdmin: true, hasLocalPassword: true, oidcLinked: false };
const member: AuthenticatedUser = { ...admin, id: 2, username: 'guest', isAdmin: false };

function event(opts: { body?: unknown; user?: AuthenticatedUser | null; id?: string; url?: string }) {
  const url = opts.url ?? 'http://localhost/api/irrigation/schedules';
  const request = new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  return {
    request,
    url: new URL(url),
    locals: { user: opts.user === undefined ? admin : opts.user },
    params: { id: opts.id ?? '' }
  };
}

async function createZone(body: Record<string, unknown>): Promise<{ id: string }> {
  const res = (await ZONE_POST(event({ body, user: admin }) as unknown as Parameters<typeof ZONE_POST>[0])) as Response;
  return (await res.json()).zone;
}

async function createSchedule(body: Record<string, unknown>): Promise<{ id: string; times: string[]; nextDueAt: string | null }> {
  const res = (await POST(event({ body, user: admin }) as unknown as Parameters<typeof POST>[0])) as Response;
  return (await res.json()).schedule;
}

beforeEach(() => {
  getIrrigationDb().exec('DELETE FROM schedules; DELETE FROM zones; DELETE FROM irrigation_events;');
});

describe('/api/irrigation/schedules', () => {
  it('lists schedules and filters by zoneId', async () => {
    let res = (await GET(event({}) as unknown as Parameters<typeof GET>[0])) as Response;
    expect((await res.json()).schedules).toEqual([]);

    const a = await createZone({ name: 'A', stationSid: 0 });
    const b = await createZone({ name: 'B', stationSid: 1 });
    await createSchedule({ zoneId: a.id, times: ['06:00'], shotSeconds: 30 });
    await createSchedule({ zoneId: b.id, times: ['07:00'], shotSeconds: 30 });

    res = (await GET(event({}) as unknown as Parameters<typeof GET>[0])) as Response;
    expect((await res.json()).schedules).toHaveLength(2);

    const url = `http://localhost/api/irrigation/schedules?zoneId=${a.id}`;
    res = (await GET(event({ url }) as unknown as Parameters<typeof GET>[0])) as Response;
    const filtered = (await res.json()).schedules;
    expect(filtered).toHaveLength(1);
    expect(filtered[0].zoneId).toBe(a.id);
  });

  it('gates create behind admin (401 anon, 403 non-admin)', async () => {
    const zone = await createZone({ name: 'A', stationSid: 0 });
    let res = (await POST(event({ body: { zoneId: zone.id, times: ['06:00'], shotSeconds: 30 }, user: null }) as unknown as Parameters<typeof POST>[0])) as Response;
    expect(res.status).toBe(401);
    res = (await POST(event({ body: { zoneId: zone.id, times: ['06:00'], shotSeconds: 30 }, user: member }) as unknown as Parameters<typeof POST>[0])) as Response;
    expect(res.status).toBe(403);
  });

  it('validates times and the exactly-one-shot-size rule', async () => {
    const zone = await createZone({ name: 'A', stationSid: 0 });
    // Bad time string.
    let res = (await POST(event({ body: { zoneId: zone.id, times: ['25:00'], shotSeconds: 30 } }) as unknown as Parameters<typeof POST>[0])) as Response;
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/time/i);
    // No shot size.
    res = (await POST(event({ body: { zoneId: zone.id, times: ['06:00'] } }) as unknown as Parameters<typeof POST>[0])) as Response;
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/exactly one/i);
    // Two shot sizes.
    res = (await POST(event({ body: { zoneId: zone.id, times: ['06:00'], shotMl: 100, shotSeconds: 30 } }) as unknown as Parameters<typeof POST>[0])) as Response;
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/exactly one/i);
  });

  it('404s an unknown zoneId', async () => {
    const res = (await POST(event({ body: { zoneId: 'nope', times: ['06:00'], shotSeconds: 30 } }) as unknown as Parameters<typeof POST>[0])) as Response;
    expect(res.status).toBe(404);
  });

  it('creates a schedule, returning HH:MM times and a next-due instant', async () => {
    const zone = await createZone({ name: 'A', stationSid: 0 });
    const res = (await POST(event({ body: { zoneId: zone.id, times: ['18:00', '06:00'], shotSeconds: 30 } }) as unknown as Parameters<typeof POST>[0])) as Response;
    expect(res.status).toBe(201);
    const schedule = (await res.json()).schedule;
    expect(schedule.times).toEqual(['06:00', '18:00']); // deduped + sorted
    expect(typeof schedule.nextDueAt === 'string').toBe(true);
  });

  it('400s a %/mL shot the zone cannot compile, but accepts one it can (and seconds always)', async () => {
    const bare = await createZone({ name: 'Bare', stationSid: 0 }); // no substrate/emitter spec
    let res = (await POST(event({ body: { zoneId: bare.id, times: ['06:00'], shotPercent: 3 } }) as unknown as Parameters<typeof POST>[0])) as Response;
    expect(res.status).toBe(400);
    res = (await POST(event({ body: { zoneId: bare.id, times: ['06:00'], shotMl: 100 } }) as unknown as Parameters<typeof POST>[0])) as Response;
    expect(res.status).toBe(400);
    // A seconds shot needs no zone spec.
    res = (await POST(event({ body: { zoneId: bare.id, times: ['06:00'], shotSeconds: 30 } }) as unknown as Parameters<typeof POST>[0])) as Response;
    expect(res.status).toBe(201);
    // A %/mL shot compiles once the zone has the spec.
    const spec = await createZone({ name: 'Spec', stationSid: 1, substrateVolumeMl: 4000, drippers: 2, emitterLph: 2 });
    res = (await POST(event({ body: { zoneId: spec.id, times: ['06:00'], shotPercent: 3 } }) as unknown as Parameters<typeof POST>[0])) as Response;
    expect(res.status).toBe(201);
  });
});

describe('/api/irrigation/schedules/[id]', () => {
  it('404s an unknown schedule and gates behind admin', async () => {
    let res = (await PATCH(event({ body: { enabled: false }, id: 'nope' }) as unknown as Parameters<typeof PATCH>[0])) as Response;
    expect(res.status).toBe(404);
    res = (await DELETE(event({ id: 'nope', user: member }) as unknown as Parameters<typeof DELETE>[0])) as Response;
    expect(res.status).toBe(403);
  });

  it('updates and deletes an existing schedule', async () => {
    // Spec'd zone so the PATCH to a mL shot below compiles (see the shot-resolution guard).
    const zone = await createZone({ name: 'A', stationSid: 0, substrateVolumeMl: 4000, drippers: 2, emitterLph: 2 });
    const sched = await createSchedule({ zoneId: zone.id, times: ['06:00'], shotSeconds: 30 });

    let res = (await PATCH(event({ body: { times: ['09:00'], shotMl: 50 }, id: sched.id }) as unknown as Parameters<typeof PATCH>[0])) as Response;
    expect(res.status).toBe(200);
    const updated = (await res.json()).schedule;
    expect(updated.times).toEqual(['09:00']);
    expect(updated.shotMl).toBe(50);
    expect(updated.shotSeconds).toBeNull(); // shot triplet replaced

    res = (await DELETE(event({ id: sched.id }) as unknown as Parameters<typeof DELETE>[0])) as Response;
    expect(res.status).toBe(200);
    res = (await DELETE(event({ id: sched.id }) as unknown as Parameters<typeof DELETE>[0])) as Response;
    expect(res.status).toBe(404);
  });

  it('400s a PATCH that switches to a %/mL shot the zone cannot compile', async () => {
    const zone = await createZone({ name: 'A', stationSid: 0 }); // no substrate/emitter spec
    const sched = await createSchedule({ zoneId: zone.id, times: ['06:00'], shotSeconds: 30 });
    const res = (await PATCH(event({ body: { shotPercent: 3 }, id: sched.id }) as unknown as Parameters<typeof PATCH>[0])) as Response;
    expect(res.status).toBe(400);
  });

  it('cascades schedule deletion when the zone is deleted', async () => {
    const zone = await createZone({ name: 'A', stationSid: 0 });
    await createSchedule({ zoneId: zone.id, times: ['06:00'], shotSeconds: 30 });
    await createSchedule({ zoneId: zone.id, times: ['18:00'], shotSeconds: 30 });

    const del = (await ZONE_DELETE(event({ id: zone.id }) as unknown as Parameters<typeof ZONE_DELETE>[0])) as Response;
    expect(del.status).toBe(200);

    const url = `http://localhost/api/irrigation/schedules?zoneId=${zone.id}`;
    const res = (await GET(event({ url }) as unknown as Parameters<typeof GET>[0])) as Response;
    expect((await res.json()).schedules).toEqual([]);
  });
});
