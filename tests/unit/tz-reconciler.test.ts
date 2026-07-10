import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  reconcileTimeZone,
  startSiteTimezoneReconciler,
  type ReconcileTimeZoneDeps,
  type ReconcileTzEntity
} from '../../src/lib/server/mqtt/tz-reconciler';
import { SiteMqttService } from '../../src/lib/server/mqtt/service';
import type { SnapshotEvent } from '../../src/lib/server/mqtt/types';
import { resetSiteTimeZoneCache } from '../../src/lib/server/settings/site-timezone';
import type { PosixResult } from '../../src/lib/server/tz/posix-tz';

const CHICAGO = 'America/Chicago';
const CHICAGO_POSIX = 'CST6CDT,M3.2.0,M11.1.0';

/** Build reconcile deps around a spyable publisher and a fixed conversion. Defaults push
 *  America/Chicago onto a single mismatched entity; individual tests override pieces. */
function makeDeps(overrides: Partial<ReconcileTimeZoneDeps> = {}): {
  deps: ReconcileTimeZoneDeps;
  publish: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
} {
  const publish = vi.fn<(entityId: string, posix: string) => Promise<void>>().mockResolvedValue(undefined);
  const warn = vi.fn<(reason: string, iana: string) => void>();
  const deps: ReconcileTimeZoneDeps = {
    desiredIana: CHICAGO,
    entities: [{ id: 'plug_time_zone', currentValue: null }],
    toPosix: (iana): PosixResult => (iana === CHICAGO ? { ok: true, posix: CHICAGO_POSIX } : { ok: false, reason: 'invalid-zone' }),
    publish,
    lastPublished: new Map<string, string>(),
    warn,
    ...overrides
  };
  return { deps, publish, warn };
}

describe('reconcileTimeZone — the six branches', () => {
  it('publishes exactly once on a mismatch and buckets the entity into pushed', async () => {
    const { deps, publish } = makeDeps();
    const report = await reconcileTimeZone(deps);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith('plug_time_zone', CHICAGO_POSIX);
    expect(report.pushed).toEqual(['plug_time_zone']);
    expect(report.inSync).toEqual([]);
    // The attempt is recorded so a later no-reset pass skips it.
    expect(deps.lastPublished.get('plug_time_zone')).toBe(CHICAGO_POSIX);
  });

  it('records inSync (no publish) when the device already reports the desired POSIX', async () => {
    const { deps, publish } = makeDeps({ entities: [{ id: 'plug_time_zone', currentValue: CHICAGO_POSIX }] });
    const report = await reconcileTimeZone(deps);
    expect(publish).not.toHaveBeenCalled();
    expect(report.inSync).toEqual(['plug_time_zone']);
    expect(report.pushed).toEqual([]);
  });

  it("skips 'already-attempted' when lastPublished already holds the desired POSIX", async () => {
    const lastPublished = new Map<string, string>([['plug_time_zone', CHICAGO_POSIX]]);
    const { deps, publish } = makeDeps({ lastPublished });
    const report = await reconcileTimeZone(deps);
    expect(publish).not.toHaveBeenCalled();
    expect(report.skipped).toEqual(['plug_time_zone']);
    expect(report.pushed).toEqual([]);
  });

  it('skips-all with a single warn when the POSIX conversion fails', async () => {
    const { deps, publish, warn } = makeDeps({
      toPosix: (): PosixResult => ({ ok: false, reason: 'no-footer' })
    });
    const report = await reconcileTimeZone(deps);
    expect(publish).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('no-footer', CHICAGO);
    expect(report).toEqual({ pushed: [], inSync: [], skipped: [], failed: [] });
  });

  it('skips-all (no warn, no publish) when there is no intentional desired zone', async () => {
    const { deps, publish, warn } = makeDeps({ desiredIana: undefined });
    const report = await reconcileTimeZone(deps);
    expect(publish).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(report).toEqual({ pushed: [], inSync: [], skipped: [], failed: [] });
  });

  it('buckets a throwing publish into failed without throwing', async () => {
    const publish = vi.fn<(entityId: string, posix: string) => Promise<void>>().mockRejectedValue(new Error('broker down'));
    const { deps } = makeDeps({ publish });
    const report = await reconcileTimeZone(deps);
    expect(report.failed).toEqual(['plug_time_zone']);
    expect(report.pushed).toEqual([]);
    // Even a failed attempt is recorded, so it won't re-publish without a reset.
    expect(deps.lastPublished.get('plug_time_zone')).toBe(CHICAGO_POSIX);
  });
});

describe('reconcileTimeZone — loop guard vs. reset across a session', () => {
  it('does not re-publish on entity re-discovery, but a reset re-attempts once', async () => {
    // A shared lastPublished map models the module-level cross-pass state.
    const lastPublished = new Map<string, string>();
    const entities: ReconcileTzEntity[] = [{ id: 'plug_time_zone', currentValue: null }];

    // Pass 1: fresh mismatch → publishes once.
    const first = makeDeps({ lastPublished, entities });
    const r1 = await reconcileTimeZone(first.deps);
    expect(r1.pushed).toEqual(['plug_time_zone']);

    // Pass 2: same entity re-discovered before the device echoed the new value back.
    // Same map, no reset → skipped, not a second publish.
    const second = makeDeps({ lastPublished, entities });
    const r2 = await reconcileTimeZone(second.deps);
    expect(second.publish).not.toHaveBeenCalled();
    expect(r2.skipped).toEqual(['plug_time_zone']);

    // Reset clears the guard (what a broker reconnect / explicit reconcile does) →
    // re-attempts exactly once.
    lastPublished.clear();
    const third = makeDeps({ lastPublished, entities });
    const r3 = await reconcileTimeZone(third.deps);
    expect(third.publish).toHaveBeenCalledTimes(1);
    expect(r3.pushed).toEqual(['plug_time_zone']);
  });

  it('re-warns once per distinct bad zone but suppresses repeat warns via the caller dedupe', async () => {
    // The pure function warns once per call; the module dedupe (mirrored here) collapses
    // repeats of the same zone to a single log line.
    let lastWarnedIana: string | null = null;
    const sink = vi.fn<(reason: string, iana: string) => void>();
    const warn = (reason: string, iana: string) => {
      if (lastWarnedIana === iana) return;
      lastWarnedIana = iana;
      sink(reason, iana);
    };
    const toPosix = (): PosixResult => ({ ok: false, reason: 'invalid-zone' });

    await reconcileTimeZone({ ...makeDeps({ toPosix, warn }).deps });
    await reconcileTimeZone({ ...makeDeps({ toPosix, warn }).deps });
    expect(sink).toHaveBeenCalledTimes(1);
  });
});

describe('startSiteTimezoneReconciler — a reconnecting device is re-stamped', () => {
  const KEYS = ['GROW_SCHEDULE_TZ', 'TZ'];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    KEYS.forEach((k) => {
      saved[k] = process.env[k];
      delete process.env[k];
    });
    // An explicit env source so deviceDesiredTimeZone() returns Chicago (a host/UTC guess
    // would be withheld from the device push).
    process.env.GROW_SCHEDULE_TZ = CHICAGO;
    resetSiteTimeZoneCache();
  });

  afterEach(() => {
    KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
    resetSiteTimeZoneCache();
  });

  it('clears the entity loop guard on re-discovery so an offline-missed device converges', async () => {
    const handlers: Array<(event: SnapshotEvent) => void> = [];
    const published: Array<[string, string]> = [];
    // The device stays on its build default ('') the whole time — it never echoes the
    // pushed POSIX, modelling a node that was offline when the retain:false command went
    // out and so never received it.
    const fake = {
      subscribe: (fn: (event: SnapshotEvent) => void) => {
        handlers.push(fn);
        return () => {};
      },
      timeZoneEntities: () => [{ id: 'plug_time_zone', component: 'text', objectId: 'time_zone', commandTopic: 'x' }],
      entityState: () => ({ value: '' }),
      publishCommand: (id: string, req: { value: string }) => {
        published.push([id, req.value]);
        return Promise.resolve();
      }
    } as unknown as SiteMqttService;

    startSiteTimezoneReconciler(fake);
    // The boot pass publishes once.
    await vi.waitFor(() => expect(published).toHaveLength(1));
    expect(published[0]).toEqual(['plug_time_zone', CHICAGO_POSIX]);

    // The device reconnects and re-publishes its retained discovery config → an entity
    // event. Its echoed state is still '' (it never got the command), so without clearing
    // the guard it would be skipped as 'already-attempted'; the fix must re-send the POSIX.
    handlers.forEach((h) =>
      h({
        type: 'entity',
        entity: { id: 'plug_time_zone', component: 'text', objectId: 'time_zone', commandTopic: 'x' }
      } as unknown as SnapshotEvent)
    );
    await vi.waitFor(() => expect(published).toHaveLength(2));
    expect(published[1]).toEqual(['plug_time_zone', CHICAGO_POSIX]);
  });
});

describe('SiteMqttService.timeZoneEntities — only tz-capable entities', () => {
  it('returns writable text/time_zone entities and ignores nodes without one', () => {
    const prefix = 'grow/daniel-home';
    const service = new SiteMqttService({
      site: 'daniel-home',
      mqttUrl: 'mqtt://localhost:1883',
      topicPrefix: prefix,
      discoveryPrefix: `${prefix}/_discovery`
    });
    const receive = (service as unknown as { handleMessage(topic: string, payload: string): void }).handleMessage.bind(service);

    // A tz-capable text entity on the plug node.
    receive(
      `${prefix}/_discovery/text/grow-plug/time_zone/config`,
      JSON.stringify({
        name: 'Time Zone',
        obj_id: 'time_zone',
        cmd_t: `${prefix}/grow-plug/text/time_zone/command`,
        stat_t: `${prefix}/grow-plug/text/time_zone/state`,
        dev: { ids: ['grow-plug'], name: 'Grow Plug' }
      })
    );
    // A read-only text/time_zone (no command topic) — must be ignored.
    receive(
      `${prefix}/_discovery/text/readonly-node/time_zone/config`,
      JSON.stringify({
        name: 'Time Zone',
        obj_id: 'time_zone',
        stat_t: `${prefix}/readonly-node/text/time_zone/state`,
        dev: { ids: ['readonly-node'], name: 'Readonly Node' }
      })
    );
    // A sensor node with no time_zone entity at all — must be ignored.
    receive(
      `${prefix}/_discovery/sensor/sensor-rig/temperature/config`,
      JSON.stringify({
        name: 'Temperature',
        obj_id: 'temperature',
        stat_t: `${prefix}/sensor-rig/sensor/temperature/state`,
        dev: { ids: ['sensor-rig'], name: 'Sensor Rig' }
      })
    );

    const tzEntities = service.timeZoneEntities();
    expect(tzEntities).toHaveLength(1);
    expect(tzEntities[0].objectId).toBe('time_zone');
    expect(tzEntities[0].commandTopic).toBe(`${prefix}/grow-plug/text/time_zone/command`);
  });
});
