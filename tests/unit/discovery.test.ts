// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import {
  buildCommandPublish,
  parseDiscoveryPayload,
  parseDiscoveryTopic
} from '../../src/lib/server/mqtt/discovery';
import { SiteMqttService } from '../../src/lib/server/mqtt/service';
import { parseUiConfigPayload, parseUiConfigTopic } from '../../src/lib/server/mqtt/ui-metadata';

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
        sug_dsp_prc: 2,
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
      suggestedDisplayPrecision: 2,
      deviceClass: 'temperature',
      entityCategory: undefined,
      writable: false
    });
  });

  it('parses long suggested display precision fields', () => {
    const entity = parseDiscoveryPayload(
      `${prefix}/sensor/atoms3u_sensor_rig/vpd/config`,
      JSON.stringify({
        name: 'VPD',
        uniq_id: 'atoms3u_vpd',
        stat_t: 'grow/daniel-home/atoms3u-sensor-rig/sensor/vpd/state',
        unit_of_measurement: 'kPa',
        suggested_display_precision: 2,
        dev: { ids: ['atoms3u-sensor-rig'], name: 'AtomS3U Sensor Rig' }
      }),
      prefix
    );

    expect(entity).toMatchObject({
      unit: 'kPa',
      suggestedDisplayPrecision: 2
    });
  });

  it('rejects topics outside the discovery prefix', () => {
    expect(parseDiscoveryTopic('homeassistant/sensor/foo/config', prefix)).toBeNull();
  });

  it('parses ESPHome abbreviated select options', () => {
    const entity = parseDiscoveryPayload(
      `${prefix}/select/atoms3u_sensor_rig/palette/config`,
      JSON.stringify({
        ops: ['rainbow', 'ironblack'],
        name: 'Palette',
        uniq_id: 'atoms3u_palette',
        cmd_t: 'grow/daniel-home/atoms3u/select/palette/command',
        dev: { ids: ['atoms3u'], name: 'AtomS3U' }
      }),
      prefix
    );

    expect(entity?.options).toEqual(['rainbow', 'ironblack']);
  });

  it('parses abbreviated entity category and icon fields', () => {
    const entity = parseDiscoveryPayload(
      `${prefix}/sensor/atoms3u_sensor_rig/wifi_signal/config`,
      JSON.stringify({
        name: 'WiFi Signal',
        uniq_id: 'atoms3u_wifi_signal',
        stat_t: 'grow/daniel-home/atoms3u-sensor-rig/sensor/wifi_signal/state',
        ent_cat: 'diagnostic',
        ic: 'mdi:wifi',
        dev: { ids: ['atoms3u-sensor-rig'], name: 'AtomS3U Sensor Rig' }
      }),
      prefix
    );

    expect(entity).toMatchObject({
      entityCategory: 'diagnostic',
      icon: 'mdi:wifi'
    });
  });

  it('parses camera discovery payload with imagePath', () => {
    const entity = parseDiscoveryPayload(
      `${prefix}/camera/atoms3u-sensor-rig/thermal_camera/config`,
      JSON.stringify({
        name: 'Thermal Camera',
        object_id: 'thermal_camera',
        unique_id: 'atoms3u-sensor-rig_thermal_camera',
        image_path: '/thermal.jpg',
        device: {
          identifiers: ['30eda0c8f338'],
          name: 'AtomS3U Sensor Rig',
          manufacturer: 'stackdrift',
          model: 'atoms3u-sensor-rig'
        }
      }),
      prefix
    );

    expect(entity).toMatchObject({
      component: 'camera',
      objectId: 'thermal_camera',
      imagePath: '/thermal.jpg',
      writable: false,
      dangerous: false
    });
    expect(entity?.stateTopic).toBeUndefined();
    expect(entity?.imageUrl).toBeUndefined();
  });

  it('keeps duplicate ESPHome unique ids scoped to their device', () => {
    const service = new SiteMqttService({
      site: 'daniel-home',
      mqttUrl: 'mqtt://localhost:1883',
      topicPrefix: 'grow/daniel-home',
      discoveryPrefix: prefix
    });
    const receive = (
      service as unknown as { handleMessage(topic: string, payload: string): void }
    ).handleMessage.bind(service);

    receive(
      `${prefix}/update/atlas-hydro-monitor/firmware_update/config`,
      JSON.stringify({
        name: 'Firmware Update',
        uniq_id: 'ESPupdatefirmware_update',
        stat_t: 'grow/daniel-home/atlas-hydro-monitor/update/firmware_update/state',
        cmd_t: 'grow/daniel-home/atlas-hydro-monitor/update/firmware_update/command',
        dev: { ids: ['f024f9e85d04'], name: 'Atlas Hydro Monitor' }
      })
    );
    receive(
      `${prefix}/update/atoms3u-sensor-rig/firmware_update/config`,
      JSON.stringify({
        name: 'Firmware Update',
        uniq_id: 'ESPupdatefirmware_update',
        stat_t: 'grow/daniel-home/atoms3u-sensor-rig/update/firmware_update/state',
        cmd_t: 'grow/daniel-home/atoms3u-sensor-rig/update/firmware_update/command',
        dev: { ids: ['30eda0c8f338'], name: 'AtomS3U Sensor Rig' }
      })
    );

    const updateEntities = service
      .snapshot()
      .entities.filter((entity) => entity.component === 'update');

    expect(updateEntities).toHaveLength(2);
    expect(new Set(updateEntities.map((entity) => entity.id)).size).toBe(2);
    expect(service.firmwareUpdateEntity('atlas-hydro-monitor')?.commandTopic).toContain(
      '/atlas-hydro-monitor/'
    );
    expect(service.firmwareUpdateEntity('atoms3u-sensor-rig')?.commandTopic).toContain(
      '/atoms3u-sensor-rig/'
    );
  });

  it('ignores discovery retained for the retired AirQ node', () => {
    const service = new SiteMqttService({
      site: 'daniel-home',
      mqttUrl: 'mqtt://localhost:1883',
      topicPrefix: 'grow/daniel-home',
      discoveryPrefix: prefix
    });
    const receive = (
      service as unknown as { handleMessage(topic: string, payload: string): void }
    ).handleMessage.bind(service);
    const stateTopic = 'grow/daniel-home/m5stack-airq/sensor/co2/state';

    receive(
      `${prefix}/sensor/m5stack-airq/co2/config`,
      JSON.stringify({
        name: 'CO2',
        uniq_id: 'm5stack_airq_co2',
        stat_t: stateTopic,
        dev: { ids: ['airq-hardware-id'], name: 'M5Stack AirQ' }
      })
    );
    receive(stateTopic, '900');

    expect(service.snapshot()).toMatchObject({ devices: [], entities: [], states: {} });
  });
});

describe('device UI metadata parsing', () => {
  const topicPrefix = 'grow/daniel-home';

  it('parses retained device UI config topics and payloads', () => {
    const topic = `${topicPrefix}/atlas-hydro-monitor/_ui/config`;

    expect(parseUiConfigTopic(topic, topicPrefix)).toBe('atlas-hydro-monitor');
    expect(
      parseUiConfigPayload(
        topic,
        JSON.stringify({
          schema: 'grow-ui.v1',
          nodeId: 'atlas-hydro-monitor',
          groups: [
            { id: 'overview', title: 'Overview', order: 0, variant: 'metrics', defaultOpen: true },
            { id: 'ph_cal', title: 'pH Calibration', order: 40 }
          ],
          entities: [
            {
              component: 'sensor',
              objectId: 'water_ph',
              group: 'overview',
              role: 'metric',
              order: 20,
              label: 'Water pH'
            },
            {
              component: 'button',
              objectId: 'ph_cal_mid__7_00_',
              group: 'ph_cal',
              order: 10,
              label: 'pH Mid Point'
            }
          ]
        }),
        topicPrefix
      )
    ).toEqual({
      nodeId: 'atlas-hydro-monitor',
      config: {
        schema: 'grow-ui.v1',
        nodeId: 'atlas-hydro-monitor',
        groups: [
          {
            id: 'overview',
            title: 'Overview',
            order: 0,
            variant: 'metrics',
            surface: undefined,
            deviceSettingsSection: undefined,
            defaultOpen: true
          },
          {
            id: 'ph_cal',
            title: 'pH Calibration',
            order: 40,
            variant: undefined,
            surface: undefined,
            deviceSettingsSection: undefined,
            defaultOpen: false
          }
        ],
        entities: [
          {
            component: 'sensor',
            objectId: 'water_ph',
            group: 'overview',
            role: 'metric',
            order: 20,
            label: 'Water pH'
          },
          {
            component: 'button',
            objectId: 'ph_cal_mid__7_00_',
            group: 'ph_cal',
            role: undefined,
            order: 10,
            label: 'pH Mid Point'
          }
        ]
      }
    });
  });

  it('parses optional device settings placement metadata', () => {
    const topic = `${topicPrefix}/atlas-hydro-monitor/_ui/config`;

    expect(
      parseUiConfigPayload(
        topic,
        JSON.stringify({
          schema: 'grow-ui.v1',
          nodeId: 'atlas-hydro-monitor',
          groups: [
            {
              id: 'controls',
              title: 'Circuit Controls',
              order: 20,
              surface: 'device-settings',
              deviceSettingsSection: 'controls'
            }
          ],
          entities: [
            {
              component: 'switch',
              objectId: 'enable_ph_circuit',
              group: 'controls',
              role: 'quick-control',
              order: 10
            }
          ]
        }),
        topicPrefix
      )?.config
    ).toMatchObject({
      groups: [
        {
          id: 'controls',
          surface: 'device-settings',
          deviceSettingsSection: 'controls',
          defaultOpen: false
        }
      ],
      entities: [{ component: 'switch', objectId: 'enable_ph_circuit', role: 'quick-control' }]
    });
  });

  it('rejects mismatched node ids and treats empty retained payloads as deletes', () => {
    const topic = `${topicPrefix}/atlas-hydro-monitor/_ui/config`;

    expect(parseUiConfigPayload(topic, 'null', topicPrefix)).toBeNull();
    expect(
      parseUiConfigPayload(
        topic,
        JSON.stringify({
          schema: 'grow-ui.v1',
          nodeId: 'atoms3u-sensor-rig',
          groups: [],
          entities: []
        }),
        topicPrefix
      )
    ).toBeNull();

    expect(parseUiConfigPayload(topic, '', topicPrefix)).toEqual({
      nodeId: 'atlas-hydro-monitor',
      config: null
    });
  });

  it('parses grow-ui.v2 into exactly the shape its v1 equivalent produces', () => {
    const topic = `${topicPrefix}/exhaust-fan/_ui/config`;

    // The same document twice: full keys, and v2's short keys with defaulted
    // values omitted (defaultOpen false, absent role/label).
    const v1 = parseUiConfigPayload(
      topic,
      JSON.stringify({
        schema: 'grow-ui.v1',
        nodeId: 'exhaust-fan',
        groups: [
          {
            id: 'overview',
            title: 'Exhaust Fan',
            order: 10,
            variant: 'metrics',
            surface: 'dashboard',
            defaultOpen: true
          },
          {
            id: 'cycle',
            title: 'Cycle Timer',
            order: 30,
            surface: 'device-settings',
            deviceSettingsSection: 'controls',
            defaultOpen: false
          }
        ],
        entities: [
          {
            component: 'sensor',
            objectId: 'fan_power',
            group: 'overview',
            role: 'metric',
            order: 10
          },
          {
            component: 'number',
            objectId: 'fan_cycle_run',
            group: 'cycle',
            order: 20,
            label: 'Run For (min)'
          }
        ]
      }),
      topicPrefix
    );

    const v2 = parseUiConfigPayload(
      topic,
      JSON.stringify({
        schema: 'grow-ui.v2',
        nodeId: 'exhaust-fan',
        groups: [
          { i: 'overview', t: 'Exhaust Fan', n: 10, v: 'metrics', s: 'dashboard', p: true },
          { i: 'cycle', t: 'Cycle Timer', n: 30, s: 'device-settings', d: 'controls' }
        ],
        entities: [
          { c: 'sensor', o: 'fan_power', g: 'overview', r: 'metric', n: 10 },
          { c: 'number', o: 'fan_cycle_run', g: 'cycle', n: 20, l: 'Run For (min)' }
        ]
      }),
      topicPrefix
    );

    expect(v2?.config?.schema).toBe('grow-ui.v2');
    expect(v2?.config?.groups).toEqual(v1?.config?.groups);
    expect(v2?.config?.entities).toEqual(v1?.config?.entities);
  });

  it('ignores unknown short keys and drops v2 members missing a required key', () => {
    const topic = `${topicPrefix}/exhaust-fan/_ui/config`;

    const parsed = parseUiConfigPayload(
      topic,
      JSON.stringify({
        schema: 'grow-ui.v2',
        nodeId: 'exhaust-fan',
        groups: [
          { i: 'cycle', t: 'Cycle Timer', n: 30, zz: 'from a newer firmware' },
          { t: 'no id, must drop', n: 40 }
        ],
        entities: [
          { c: 'switch', o: 'fan_cycle', g: 'cycle', n: 10 },
          { c: 'switch', g: 'cycle', n: 20 }
        ]
      }),
      topicPrefix
    );

    expect(parsed?.config?.groups).toEqual([
      {
        id: 'cycle',
        title: 'Cycle Timer',
        order: 30,
        variant: undefined,
        surface: undefined,
        deviceSettingsSection: undefined,
        defaultOpen: false
      }
    ]);
    expect(parsed?.config?.entities).toEqual([
      {
        component: 'switch',
        objectId: 'fan_cycle',
        group: 'cycle',
        role: undefined,
        order: 10,
        label: undefined
      }
    ]);
  });

  it('rejects an unknown schema version outright', () => {
    const topic = `${topicPrefix}/exhaust-fan/_ui/config`;

    expect(
      parseUiConfigPayload(
        topic,
        JSON.stringify({ schema: 'grow-ui.v3', nodeId: 'exhaust-fan', groups: [], entities: [] }),
        topicPrefix
      )
    ).toBeNull();
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

  it('encodes time commands as the ESPHome mqtt_time JSON object', () => {
    const entity = parseDiscoveryPayload(
      `${prefix}/time/atlas/lights_on/config`,
      JSON.stringify({
        name: 'Lights On',
        uniq_id: 'atlas_lights_on',
        stat_t: 'grow/daniel-home/atlas/time/lights_on/state',
        cmd_t: 'grow/daniel-home/atlas/time/lights_on/command',
        dev: { ids: ['atlas'], name: 'Atlas' }
      }),
      prefix
    );

    expect(entity).not.toBeNull();
    expect(buildCommandPublish(entity!, { value: '18:00' })).toEqual({
      topic: 'grow/daniel-home/atlas/time/lights_on/command',
      payload: '{"hour":18,"minute":0,"second":0}',
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
