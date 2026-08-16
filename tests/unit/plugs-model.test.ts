// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import {
  EXHAUST_NODE,
  GROW_LIGHT_NODE,
  PLUGS,
  activityDot,
  resolvePlug,
  resolvePlugs,
  switchIsOn,
  type PlugSpec
} from '../../src/lib/plugs/model';
import { IRRIGATION_NODE, RUNOFF_NODE } from '../../src/lib/irrigation/model';
import type {
  DeviceSnapshot,
  EntityConfig,
  EntityState,
  Snapshot
} from '../../src/lib/server/mqtt/types';

function makeEntity(
  nodeId: string,
  overrides: Partial<EntityConfig> & { id: string; name: string; objectId: string }
): EntityConfig {
  return {
    component: 'sensor',
    uniqueId: overrides.id,
    nodeId,
    // The Athom plugs ship discovery with no device `ids`, so identifiers[0] is a uniq_id
    // slug rather than the node name. Mirrored here on purpose.
    device: {
      identifiers: [`slug_${overrides.id}`],
      name: nodeId,
      manufacturer: 'athom',
      model: 'plug-v2'
    },
    payloadAvailable: 'online',
    payloadNotAvailable: 'offline',
    dangerous: false,
    writable: false,
    raw: {},
    ...overrides
  } as EntityConfig;
}

const state = (value: string): EntityState => ({ value, updatedAt: '2026-08-12T00:00:00.000Z' });

function makeSnapshot(
  entities: EntityConfig[],
  states: Record<string, EntityState>,
  availabilityByNode: Record<string, string> = {}
): Snapshot {
  const nodes = [...new Set(entities.map((e) => e.nodeId ?? ''))];
  const devices: DeviceSnapshot[] = nodes.map(
    (nodeId) =>
      ({
        id: `slug_${nodeId}`,
        nodeId,
        name: nodeId,
        availability: availabilityByNode[nodeId] ?? 'online',
        entityIds: entities.filter((e) => e.nodeId === nodeId).map((e) => e.id)
      }) as DeviceSnapshot
  );
  return {
    site: 'daniel-home',
    timezone: 'UTC',
    topicPrefix: 'grow/daniel-home',
    discoveryPrefix: 'grow/daniel-home/_discovery',
    generatedAt: '2026-08-12T00:00:00.000Z',
    broker: {
      connected: true,
      connecting: false,
      error: null,
      lastConnectedAt: null,
      lastMessageAt: null
    },
    devices,
    entities,
    states,
    uiConfigs: {},
    lights: [],
    firmware: { devices: {}, channels: {} }
  } as unknown as Snapshot;
}

const spec = (node: string): PlugSpec => PLUGS.find((p) => p.node === node)!;

/** A plug with its relay, power and daily-energy entities. */
function plugEntities(
  node: string,
  relayObjectId: string | null,
  powerObjectId: string
): EntityConfig[] {
  const out: EntityConfig[] = [
    makeEntity(node, { id: `${node}_power`, name: 'Power', objectId: powerObjectId, unit: 'W' }),
    // Every plug publishes this same objectId — the collision the resolver must survive.
    makeEntity(node, {
      id: `${node}_daily`,
      name: 'Daily Energy',
      objectId: 'total_daily_energy',
      unit: 'kWh'
    })
  ];
  if (relayObjectId) {
    out.push(
      makeEntity(node, {
        id: `${node}_relay`,
        name: 'Relay',
        objectId: relayObjectId,
        component: 'switch',
        writable: true,
        payloadOn: 'ON',
        payloadOff: 'OFF'
      })
    );
  }
  return out;
}

describe('resolvePlug — entity resolution', () => {
  // Every Athom plug publishes `total_daily_energy`; resolving by objectId alone would
  // hand one plug another's meter.
  it('resolves colliding objectIds to the right node', () => {
    const entities = [
      ...plugEntities(EXHAUST_NODE, 'exhaust_fan', 'fan_power'),
      ...plugEntities(GROW_LIGHT_NODE, 'grow_light', 'light_power')
    ];
    const snapshot = makeSnapshot(entities, {
      [`${EXHAUST_NODE}_daily`]: state('0.04'),
      [`${GROW_LIGHT_NODE}_daily`]: state('4.71')
    });

    expect(resolvePlug(snapshot, spec(EXHAUST_NODE)).dailyEnergy?.id).toBe(`${EXHAUST_NODE}_daily`);
    expect(resolvePlug(snapshot, spec(GROW_LIGHT_NODE)).dailyEnergy?.id).toBe(
      `${GROW_LIGHT_NODE}_daily`
    );
  });

  // The plugs' device.identifiers[0] is a uniq_id slug, not the node name, so availability
  // has to be resolved through nodeId as well or an offline plug reads as online.
  it('sees a plug offline even though its device id is a slug', () => {
    const entities = plugEntities(EXHAUST_NODE, 'exhaust_fan', 'fan_power');
    const snapshot = makeSnapshot(
      entities,
      { [`${EXHAUST_NODE}_relay`]: state('ON') },
      { [EXHAUST_NODE]: 'offline' }
    );
    const plug = resolvePlug(snapshot, spec(EXHAUST_NODE));
    expect(plug.offline).toBe(true);
    expect(plug.activity).toBe('offline');
  });

  it('treats a never-reported LWT as available, not offline', () => {
    const entities = plugEntities(EXHAUST_NODE, 'exhaust_fan', 'fan_power');
    const snapshot = makeSnapshot(
      entities,
      { [`${EXHAUST_NODE}_relay`]: state('OFF') },
      { [EXHAUST_NODE]: 'unknown' }
    );
    expect(resolvePlug(snapshot, spec(EXHAUST_NODE)).offline).toBe(false);
  });
});

describe('resolvePlug — activity', () => {
  function exhaust(relay: string, watts?: string) {
    const entities = plugEntities(EXHAUST_NODE, 'exhaust_fan', 'fan_power');
    const states: Record<string, EntityState> = { [`${EXHAUST_NODE}_relay`]: state(relay) };
    if (watts !== undefined) states[`${EXHAUST_NODE}_power`] = state(watts);
    return resolvePlug(makeSnapshot(entities, states), spec(EXHAUST_NODE));
  }

  it('is off when the relay is open, regardless of the meter', () => {
    expect(exhaust('OFF', '0').activity).toBe('off');
  });

  it('is running when the draw clears the threshold', () => {
    expect(exhaust('ON', '6.2').activity).toBe('running');
  });

  // The exhaust plug floors power below 3 W to exactly 0, and the fan at low speed runs
  // under that. Calling it idle would be a measurement the hardware cannot make.
  it('is indeterminate when a sub-floor load reads zero', () => {
    const plug = exhaust('ON', '0');
    expect(plug.activity).toBe('indeterminate');
    expect(activityDot(plug.activity)).toBe('ok');
  });

  it('is idle when a load that cannot run sub-floor reads zero', () => {
    const entities = plugEntities(IRRIGATION_NODE, 'irrigation_pump', 'pump_power');
    const snapshot = makeSnapshot(entities, {
      [`${IRRIGATION_NODE}_relay`]: state('ON'),
      [`${IRRIGATION_NODE}_power`]: state('0')
    });
    expect(resolvePlug(snapshot, spec(IRRIGATION_NODE)).activity).toBe('idle');
  });

  it('is unknown when the meter has not reported', () => {
    expect(exhaust('ON').activity).toBe('unknown');
  });

  it('only pulses the dot for a measured run', () => {
    expect(activityDot('running')).toBe('ok pulse');
    expect(activityDot('indeterminate')).not.toContain('pulse');
    expect(activityDot('offline')).toBe('alert');
  });
});

describe('resolvePlug — monitor-only plugs', () => {
  // The runoff relay is internal:true in firmware and never published, so there is nothing
  // to switch — but its draw still says whether the pump is running.
  it('yields no relay and still reports running from draw', () => {
    const entities = plugEntities(RUNOFF_NODE, null, 'runoff_pump_power');
    const snapshot = makeSnapshot(entities, { [`${RUNOFF_NODE}_power`]: state('24') });
    const plug = resolvePlug(snapshot, spec(RUNOFF_NODE));
    expect(plug.relay).toBeUndefined();
    expect(plug.activity).toBe('running');
  });

  it('reports idle rather than off when a monitor-only pump is not drawing', () => {
    const entities = plugEntities(RUNOFF_NODE, null, 'runoff_pump_power');
    const snapshot = makeSnapshot(entities, { [`${RUNOFF_NODE}_power`]: state('0') });
    expect(resolvePlug(snapshot, spec(RUNOFF_NODE)).activity).toBe('idle');
  });
});

describe('resolvePlug — arms', () => {
  function withArms(cycle: string, schedule: string) {
    const entities = [
      ...plugEntities(EXHAUST_NODE, 'exhaust_fan', 'fan_power'),
      makeEntity(EXHAUST_NODE, {
        id: 'fan_cycle',
        name: 'Fan Cycle',
        objectId: 'fan_cycle',
        component: 'switch',
        writable: true,
        payloadOn: 'ON',
        payloadOff: 'OFF'
      }),
      makeEntity(EXHAUST_NODE, {
        id: 'fan_schedule',
        name: 'Fan Schedule',
        objectId: 'fan_schedule',
        component: 'switch',
        writable: true,
        payloadOn: 'ON',
        payloadOff: 'OFF'
      })
    ];
    return resolvePlug(
      makeSnapshot(entities, {
        [`${EXHAUST_NODE}_relay`]: state('ON'),
        fan_cycle: state(cycle),
        fan_schedule: state(schedule)
      }),
      spec(EXHAUST_NODE)
    );
  }

  // While either arm is on the plug re-asserts the relay every 10 s, so a toggle from the
  // card silently reverts — the card has to be able to say so.
  it('flags armed when any arm is on', () => {
    expect(withArms('ON', 'OFF').armed).toBe(true);
    expect(withArms('OFF', 'ON').armed).toBe(true);
    expect(withArms('OFF', 'OFF').armed).toBe(false);
  });

  it('reports each arm individually', () => {
    const plug = withArms('ON', 'OFF');
    expect(plug.arms.map((a) => [a.label, a.armed])).toEqual([
      ['cycle', true],
      ['schedule', false]
    ]);
  });

  it('omits arms that have not been discovered', () => {
    const entities = plugEntities(EXHAUST_NODE, 'exhaust_fan', 'fan_power');
    const plug = resolvePlug(makeSnapshot(entities, {}), spec(EXHAUST_NODE));
    expect(plug.arms).toEqual([]);
    expect(plug.armed).toBe(false);
  });
});

describe('resolvePlugs', () => {
  it('drops plugs that have not been discovered', () => {
    const entities = plugEntities(EXHAUST_NODE, 'exhaust_fan', 'fan_power');
    const plugs = resolvePlugs(makeSnapshot(entities, {}));
    expect(plugs.map((p) => p.spec.node)).toEqual([EXHAUST_NODE]);
  });

  it('preserves registry order for the plugs present', () => {
    const entities = [
      ...plugEntities(RUNOFF_NODE, null, 'runoff_pump_power'),
      ...plugEntities(EXHAUST_NODE, 'exhaust_fan', 'fan_power')
    ];
    expect(resolvePlugs(makeSnapshot(entities, {})).map((p) => p.spec.node)).toEqual([
      EXHAUST_NODE,
      RUNOFF_NODE
    ]);
  });
});

describe('switchIsOn', () => {
  it('honours a custom payloadOn and treats a missing state as off', () => {
    const e = makeEntity(EXHAUST_NODE, {
      id: 's',
      name: 'S',
      objectId: 's',
      component: 'switch',
      payloadOn: 'RUNNING',
      payloadOff: 'IDLE'
    });
    expect(switchIsOn(makeSnapshot([e], { s: state('RUNNING') }), e)).toBe(true);
    expect(switchIsOn(makeSnapshot([e], { s: state('IDLE') }), e)).toBe(false);
    expect(switchIsOn(makeSnapshot([e], {}), e)).toBe(false);
    expect(switchIsOn(makeSnapshot([e], {}), undefined)).toBe(false);
  });
});

describe('the irrigation pump is guarded', () => {
  // It is the supply cut-off, not the irrigation actuator: switching it off stops all
  // irrigation silently, so the card must not offer it as a bare toggle.
  it('requires confirmation and carries a warning note', () => {
    const pump = spec(IRRIGATION_NODE);
    expect(pump.confirmToggle).toBe(true);
    expect(pump.note).toMatch(/irrigation/i);
  });

  it('leaves the other switchable plugs unconfirmed', () => {
    expect(spec(EXHAUST_NODE).confirmToggle).toBeUndefined();
    expect(spec(GROW_LIGHT_NODE).confirmToggle).toBeUndefined();
  });
});
