import { describe, expect, it } from 'vitest';
import { buildCommandPublish, parseDiscoveryPayload, parseDiscoveryTopic } from '../../src/lib/server/mqtt/discovery';

const prefix = 'grow/daniel-home/_discovery';

describe('MQTT discovery parsing', () => {
  it('parses site-scoped ESPHome discovery topics and resolves abbreviated fields', () => {
    const entity = parseDiscoveryPayload(
      `${prefix}/sensor/atoms3u_sensor_rig/temperature/config`,
      JSON.stringify({
        '~': 'grow/daniel-home/atoms3u-sensor-rig',
        name: 'Temperature',
        uniq_id: 'atoms3u_temperature',
        stat_t: '~/sensor/temperature/state',
        avty_t: '~/status',
        unit_of_meas: '°C',
        dev_cla: 'temperature',
        dev: {
          ids: ['atoms3u-sensor-rig'],
          name: 'AtomS3U Sensor Rig',
          mf: 'M5Stack',
          mdl: 'AtomS3U'
        }
      }),
      prefix
    );

    expect(entity).toMatchObject({
      id: 'atoms3u_temperature',
      component: 'sensor',
      name: 'Temperature',
      stateTopic: 'grow/daniel-home/atoms3u-sensor-rig/sensor/temperature/state',
      availabilityTopic: 'grow/daniel-home/atoms3u-sensor-rig/status',
      unit: '°C',
      deviceClass: 'temperature',
      writable: false
    });
  });

  it('rejects topics outside the discovery prefix', () => {
    expect(parseDiscoveryTopic('homeassistant/sensor/foo/config', prefix)).toBeNull();
  });
});

describe('command publishing', () => {
  it('builds non-retained switch command payloads', () => {
    const entity = parseDiscoveryPayload(
      `${prefix}/switch/atlas/pump/config`,
      JSON.stringify({
        name: 'Pump',
        uniq_id: 'atlas_pump',
        stat_t: 'grow/daniel-home/atlas/switch/pump/state',
        cmd_t: 'grow/daniel-home/atlas/switch/pump/command',
        pl_on: 'ON',
        pl_off: 'OFF',
        dev: { ids: ['atlas'], name: 'Atlas' }
      }),
      prefix
    );

    expect(entity).not.toBeNull();
    expect(buildCommandPublish(entity!, { value: true })).toEqual({
      topic: 'grow/daniel-home/atlas/switch/pump/command',
      payload: 'ON',
      retain: false
    });
  });

  it('requires confirmation for button commands', () => {
    const entity = parseDiscoveryPayload(
      `${prefix}/button/atlas/factory_reset/config`,
      JSON.stringify({
        name: 'Factory Reset',
        uniq_id: 'atlas_factory_reset',
        cmd_t: 'grow/daniel-home/atlas/button/factory_reset/command',
        dev: { ids: ['atlas'], name: 'Atlas' }
      }),
      prefix
    );

    expect(() => buildCommandPublish(entity!, {})).toThrow(/Confirmation required/);
    expect(buildCommandPublish(entity!, { confirm: true })).toMatchObject({
      payload: 'PRESS',
      retain: false
    });
  });
});
