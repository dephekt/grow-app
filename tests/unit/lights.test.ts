import { describe, expect, it } from 'vitest';
import { parseLightsConfigPayload } from '../../src/lib/server/mqtt/light-metadata';
import { computeSchedule, entityByRef, formatCountdown, photoperiodHours } from '../../src/lib/lights/model';
import { SiteMqttService } from '../../src/lib/server/mqtt/service';
import type { EntityConfig, Snapshot } from '../../src/lib/server/mqtt/types';

const PREFIX = 'grow/daniel-home';

describe('photoperiodHours', () => {
  it('computes the on/off split from schedule times (wraps midnight)', () => {
    expect(photoperiodHours('06:00:00', '02:00:00')).toEqual({ onHours: 20, offHours: 4 }); // veg
    expect(photoperiodHours('06:00:00', '00:00:00')).toEqual({ onHours: 18, offHours: 6 }); // seedling
    expect(photoperiodHours('06:00', '18:00')).toEqual({ onHours: 12, offHours: 12 }); // flower
  });

  it('returns null when either time is unparseable', () => {
    expect(photoperiodHours(null, '02:00:00')).toBeNull();
    expect(photoperiodHours('06:00:00', '')).toBeNull();
  });
});

describe('parseLightsConfigPayload', () => {
  it('parses a valid fragment and keeps string / string[] roles', () => {
    const topic = `${PREFIX}/grow-light/_lights/config`;
    const payload = JSON.stringify({
      schema: 'grow-lights.v1',
      nodeId: 'grow-light',
      lights: [
        {
          id: 'main',
          name: 'Main Light',
          type: 'full-spectrum',
          order: 10,
          roles: { power: 'grow_light', metrics: ['light_power', 'apparent_power'] }
        }
      ]
    });
    const result = parseLightsConfigPayload(topic, payload, PREFIX);
    expect(result?.nodeId).toBe('grow-light');
    expect(result?.fragment?.lights[0]).toMatchObject({ id: 'main', name: 'Main Light', order: 10 });
    expect(result?.fragment?.lights[0].roles).toEqual({
      power: 'grow_light',
      metrics: ['light_power', 'apparent_power']
    });
  });

  it('treats an empty payload as a deletion (retained clear)', () => {
    const topic = `${PREFIX}/grow-light/_lights/config`;
    expect(parseLightsConfigPayload(topic, '', PREFIX)).toEqual({ nodeId: 'grow-light', fragment: null });
  });

  it('rejects a wrong schema, a nodeId mismatch, or a non-_lights topic', () => {
    const topic = `${PREFIX}/grow-light/_lights/config`;
    expect(parseLightsConfigPayload(topic, JSON.stringify({ schema: 'x', nodeId: 'grow-light', lights: [] }), PREFIX)).toBeNull();
    expect(
      parseLightsConfigPayload(topic, JSON.stringify({ schema: 'grow-lights.v1', nodeId: 'other', lights: [] }), PREFIX)
    ).toBeNull();
    expect(parseLightsConfigPayload(`${PREFIX}/grow-light/_ui/config`, '{}', PREFIX)).toBeNull();
  });

  it('drops malformed lights and unusable role values', () => {
    const topic = `${PREFIX}/atoms3u-sensor-rig/_lights/config`;
    const payload = JSON.stringify({
      schema: 'grow-lights.v1',
      nodeId: 'atoms3u-sensor-rig',
      lights: [
        { id: 'main', roles: { dimmer: 'grow_light_brightness', bogus: 123, metrics: ['a', 5] } },
        { noId: true }
      ]
    });
    const fragment = parseLightsConfigPayload(topic, payload, PREFIX)?.fragment;
    expect(fragment?.lights).toHaveLength(1);
    expect(fragment?.lights[0].roles).toEqual({ dimmer: 'grow_light_brightness', metrics: ['a'] });
  });

  it('returns null on invalid JSON', () => {
    expect(parseLightsConfigPayload(`${PREFIX}/x/_lights/config`, '{not json', PREFIX)).toBeNull();
  });
});

function entity(node: string, objectId: string): EntityConfig {
  return { objectId, nodeId: node, device: { identifiers: [node], name: node } } as unknown as EntityConfig;
}

describe('entityByRef', () => {
  const snapshot = {
    entities: [entity('grow-light', 'grow_light'), entity('atoms3u-sensor-rig', 'grow_light_brightness')]
  } as unknown as Snapshot;

  it('resolves a role reference across devices by node + objectId', () => {
    expect(entityByRef(snapshot, { node: 'atoms3u-sensor-rig', objectId: 'grow_light_brightness' })?.nodeId).toBe(
      'atoms3u-sensor-rig'
    );
  });

  it('misses on an unknown ref or undefined ref', () => {
    expect(entityByRef(snapshot, { node: 'grow-light', objectId: 'nope' })).toBeUndefined();
    expect(entityByRef(snapshot, undefined)).toBeUndefined();
  });

  it('matches only the entity node, not a secondary device identifier (removed fallback)', () => {
    // nodeId present: a ref pointing at a *secondary* device identifier must miss.
    const withNodeId = {
      objectId: 'grow_light',
      nodeId: 'primary-node',
      device: { identifiers: ['primary-node', 'legacy-alias'], name: 'x' }
    } as unknown as EntityConfig;
    // nodeId absent: the node falls back to the *primary* identifier only.
    const noNodeId = {
      objectId: 'relay',
      device: { identifiers: ['dev-a', 'dev-b'], name: 'y' }
    } as unknown as EntityConfig;
    const snap = { entities: [withNodeId, noNodeId] } as unknown as Snapshot;

    expect(entityByRef(snap, { node: 'primary-node', objectId: 'grow_light' })?.objectId).toBe('grow_light');
    expect(entityByRef(snap, { node: 'legacy-alias', objectId: 'grow_light' })).toBeUndefined();
    expect(entityByRef(snap, { node: 'dev-a', objectId: 'relay' })?.objectId).toBe('relay');
    expect(entityByRef(snap, { node: 'dev-b', objectId: 'relay' })).toBeUndefined();
  });
});

describe('SiteMqttService.mergedLights (cross-device fragment merge)', () => {
  function lightsService() {
    const service = new SiteMqttService({
      site: 'daniel-home',
      mqttUrl: 'mqtt://localhost:1883',
      topicPrefix: PREFIX,
      discoveryPrefix: `${PREFIX}/_discovery`
    });
    const receive = (
      service as unknown as { handleMessage(topic: string, payload: string): void }
    ).handleMessage.bind(service);
    const publishFragment = (nodeId: string, lights: unknown[]) =>
      receive(`${PREFIX}/${nodeId}/_lights/config`, JSON.stringify({ schema: 'grow-lights.v1', nodeId, lights }));
    return { service, receive, publishFragment };
  }

  it('merges fragments for one light id: name anchor, cross-node roles, accumulated metrics', () => {
    const { service, publishFragment } = lightsService();
    // Arrival order is plug-then-dac; the merged result must be independent of it.
    publishFragment('zzz-plug', [
      {
        id: 'main',
        name: 'Main Light',
        type: 'full-spectrum',
        order: 5,
        roles: { power: 'relay', metrics: ['plug_power'] }
      }
    ]);
    publishFragment('aaa-dac', [
      { id: 'main', order: 99, roles: { dimmer: 'ch1_brightness', metrics: ['dac_power'] } }
    ]);

    const { lights } = service.snapshot();
    expect(lights).toHaveLength(1);
    const [light] = lights;
    // Identity (name/type/order) comes only from the anchor entry (the one with a
    // name); the dac fragment's order 99 must not override the plug's order 5.
    expect(light).toMatchObject({ id: 'main', name: 'Main Light', type: 'full-spectrum', order: 5 });
    // Scalar roles are stamped with the node that published them.
    expect(light.roles.power).toEqual({ node: 'zzz-plug', objectId: 'relay' });
    expect(light.roles.dimmer).toEqual({ node: 'aaa-dac', objectId: 'ch1_brightness' });
    // Metrics ACCUMULATE across fragments, ordered by the deterministic nodeId
    // sort (aaa-dac before zzz-plug) rather than by message arrival order.
    expect(light.roles.metrics).toEqual([
      { node: 'aaa-dac', objectId: 'dac_power' },
      { node: 'zzz-plug', objectId: 'plug_power' }
    ]);
  });

  it('orders lights by order then name, honoring an explicit order 0', () => {
    const { service, publishFragment } = lightsService();
    publishFragment('plug', [
      { id: 'bench', name: 'Bench', order: 0, roles: { power: 'relay_b' } },
      { id: 'aux', name: 'Aux', order: 10, roles: { power: 'relay_a' } }
    ]);
    expect(service.snapshot().lights.map((l) => l.id)).toEqual(['bench', 'aux']);
  });

  it('drops a light once its retained fragment is cleared', () => {
    const { service, receive, publishFragment } = lightsService();
    publishFragment('plug', [{ id: 'main', name: 'Main', roles: { power: 'relay' } }]);
    expect(service.snapshot().lights).toHaveLength(1);
    receive(`${PREFIX}/plug/_lights/config`, ''); // empty retained payload = deletion
    expect(service.snapshot().lights).toHaveLength(0);
  });
});

describe('computeSchedule (mirrors the firmware half-open window)', () => {
  // A UTC instant projected through tz:'UTC' reads its own wall clock, so these
  // pin the original hour-of-day numbers independent of the runner's timezone.
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 0, 1, h, m));

  it('same-day window, inside: counts down to off', () => {
    const s = computeSchedule('06:00:00', '18:00:00', at(9), 'UTC');
    expect(s).toMatchObject({ hasWindow: true, inWindow: true, next: 'off' });
    expect(s.secondsUntil).toBe(9 * 3600); // 09:00 -> 18:00
  });

  it('same-day window, before on: counts down to on', () => {
    const s = computeSchedule('06:00:00', '18:00:00', at(5), 'UTC');
    expect(s).toMatchObject({ inWindow: false, next: 'on' });
    expect(s.secondsUntil).toBe(3600);
  });

  it('wraps midnight (on 18:00, off 06:00)', () => {
    expect(computeSchedule('18:00:00', '06:00:00', at(23), 'UTC')).toMatchObject({ inWindow: true, next: 'off' });
    expect(computeSchedule('18:00:00', '06:00:00', at(12), 'UTC')).toMatchObject({ inWindow: false, next: 'on' });
  });

  it('on == off is an empty window; invalid/absent times have no window', () => {
    expect(computeSchedule('06:00:00', '06:00:00', at(9), 'UTC').hasWindow).toBe(false);
    expect(computeSchedule('nope', '18:00:00', at(9), 'UTC').hasWindow).toBe(false);
    expect(computeSchedule(null, null, at(9), 'UTC').hasWindow).toBe(false);
  });

  it('projects the instant into the site tz, not the runner clock (offset skew)', () => {
    // 01:00 UTC is 19:00 the previous day in Chicago (CST, UTC-6). The window is
    // the SAME-DAY 06:00–18:00, so 19:00 wall time is past off → counts down to
    // the next on 11h away. Reading the raw 01:00 UTC hour would wrongly report
    // "before on, 5h to go", so this asserts the tz projection is what drives it.
    const s = computeSchedule('06:00:00', '18:00:00', new Date(Date.UTC(2026, 0, 1, 1, 0)), 'America/Chicago');
    expect(s).toMatchObject({ inWindow: false, next: 'on' });
    expect(s.secondsUntil).toBe(11 * 3600);
  });

  it('wraps midnight computed in the site tz', () => {
    // 06:00 UTC is exactly 00:00 Chicago. With the wrap window on 18:00 / off
    // 06:00, midnight is inside the lit stretch and off is 6h away — all judged
    // against the tz-local wall clock, not UTC (which would read 06:00 = at off).
    const s = computeSchedule('18:00:00', '06:00:00', new Date(Date.UTC(2026, 0, 1, 6, 0)), 'America/Chicago');
    expect(s).toMatchObject({ hasWindow: true, inWindow: true, next: 'off' });
    expect(s.secondsUntil).toBe(6 * 3600);
  });
});

describe('formatCountdown', () => {
  it('renders H:MM at or above an hour', () => expect(formatCountdown(5 * 3600 + 46 * 60)).toBe('5:46'));
  it('renders M:SS below an hour', () => expect(formatCountdown(46 * 60 + 12)).toBe('46:12'));
  it('zero-pads the minor field', () => {
    expect(formatCountdown(3600 + 5 * 60)).toBe('1:05');
    expect(formatCountdown(65)).toBe('1:05');
  });
});
