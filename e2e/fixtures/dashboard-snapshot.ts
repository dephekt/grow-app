// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { EntityState, Snapshot } from '../../src/lib/server/mqtt/types';

const PLUG_TS = new Date('2026-06-13T12:00:00Z').toISOString();

interface PlugFixture {
  node: string;
  name: string;
  relay?: { objectId: string; on: boolean };
  arms?: Array<{ objectId: string; name: string; on: boolean }>;
  power: { objectId: string; watts: string };
  dailyKwh: string;
}

/**
 * The four Athom plugs, each chosen to exercise a distinct activity state:
 * exhaust = armed + sub-floor draw, light = running, pump = idle, runoff = monitor-only.
 *
 * `device.identifiers[0]` is deliberately a uniq_id-style slug rather than the node name —
 * that is how these plugs really publish discovery, and resolving past it is the thing the
 * card has to get right.
 */
const PLUG_FIXTURES: PlugFixture[] = [
  {
    node: 'exhaust-fan',
    name: 'Exhaust Fan',
    relay: { objectId: 'exhaust_fan', on: true },
    arms: [
      { objectId: 'fan_cycle', name: 'Fan Cycle', on: true },
      { objectId: 'fan_schedule', name: 'Fan Schedule', on: false }
    ],
    power: { objectId: 'fan_power', watts: '0' },
    dailyKwh: '0.04'
  },
  {
    node: 'grow-light',
    name: 'Grow Light',
    relay: { objectId: 'grow_light', on: true },
    arms: [{ objectId: 'light_schedule', name: 'Light Schedule', on: false }],
    power: { objectId: 'light_power', watts: '312.4' },
    dailyKwh: '4.71'
  },
  {
    node: 'irrigation-pump',
    name: 'Irrigation Pump',
    relay: { objectId: 'irrigation_pump', on: true },
    power: { objectId: 'pump_power', watts: '0' },
    dailyKwh: '0.31'
  },
  {
    node: 'runoff-monitor',
    name: 'Runoff Monitor',
    power: { objectId: 'runoff_pump_power', watts: '24.2' },
    dailyKwh: '0.02'
  }
];

const plugSlug = (node: string) => `${node.replace(/-/g, '')}a1b2c3`;

function plugSwitch(node: string, name: string, objectId: string) {
  return {
    id: `${node}_${objectId}`,
    component: 'switch',
    name,
    uniqueId: `${node}_${objectId}`,
    objectId,
    nodeId: node,
    device: { identifiers: [plugSlug(node)], name },
    stateTopic: `grow/daniel-home/${node}/switch/${objectId}/state`,
    commandTopic: `grow/daniel-home/${node}/switch/${objectId}/command`,
    payloadOn: 'ON',
    payloadOff: 'OFF',
    payloadAvailable: 'online',
    payloadNotAvailable: 'offline',
    dangerous: false,
    writable: true,
    raw: {}
  };
}

function plugSensor(node: string, name: string, objectId: string, unit: string) {
  return {
    id: `${node}_${objectId}`,
    component: 'sensor',
    name,
    uniqueId: `${node}_${objectId}`,
    objectId,
    nodeId: node,
    device: { identifiers: [plugSlug(node)], name },
    stateTopic: `grow/daniel-home/${node}/sensor/${objectId}/state`,
    unit,
    suggestedDisplayPrecision: 2,
    payloadAvailable: 'online',
    payloadNotAvailable: 'offline',
    dangerous: false,
    writable: false,
    raw: {}
  };
}

const plugEntities = PLUG_FIXTURES.flatMap((p) => [
  ...(p.relay ? [plugSwitch(p.node, p.name, p.relay.objectId)] : []),
  ...(p.arms ?? []).map((arm) => plugSwitch(p.node, arm.name, arm.objectId)),
  plugSensor(p.node, `${p.name} Power`, p.power.objectId, 'W'),
  plugSensor(p.node, 'Daily Energy', 'total_daily_energy', 'kWh')
]);

const plugDevices = PLUG_FIXTURES.map((p) => ({
  id: plugSlug(p.node),
  nodeId: p.node,
  name: p.name,
  manufacturer: 'Athom',
  model: 'Smart Plug US V2',
  availability: 'online' as const,
  entityIds: plugEntities.filter((e) => e.nodeId === p.node).map((e) => e.id)
}));

// Object.fromEntries only returns something better than `any` when its input is tuples, and an
// array literal inside a conditional spread infers as (string | EntityState)[] instead. Building
// each pair through a helper that returns a real tuple is what makes the map typed -- untyped, it
// spread `any` into the fixture's states and out through every spec that clones it.
const entry = (key: string, value: string): [string, EntityState] => [
  key,
  { value, updatedAt: PLUG_TS }
];

const plugStates: Record<string, EntityState> = Object.fromEntries(
  PLUG_FIXTURES.flatMap((p) => [
    ...(p.relay ? [entry(`${p.node}_${p.relay.objectId}`, p.relay.on ? 'ON' : 'OFF')] : []),
    ...(p.arms ?? []).map((arm) => entry(`${p.node}_${arm.objectId}`, arm.on ? 'ON' : 'OFF')),
    entry(`${p.node}_${p.power.objectId}`, p.power.watts),
    entry(`${p.node}_total_daily_energy`, p.dailyKwh)
  ])
);

export const dashboardSnapshot = {
  site: 'daniel-home',
  timezone: 'UTC',
  topicPrefix: 'grow/daniel-home',
  discoveryPrefix: 'grow/daniel-home/_discovery',
  generatedAt: new Date('2026-06-13T12:00:00Z').toISOString(),
  broker: {
    connected: true,
    connecting: false,
    error: null,
    lastConnectedAt: new Date('2026-06-13T11:59:00Z').toISOString(),
    lastMessageAt: new Date('2026-06-13T12:00:00Z').toISOString()
  },
  devices: [
    {
      id: 'atoms3u-sensor-rig',
      nodeId: 'atoms3u-sensor-rig',
      name: 'AtomS3U Sensor Rig',
      manufacturer: 'M5Stack',
      model: 'AtomS3U',
      availability: 'online',
      entityIds: [
        'atoms3u_temperature',
        'atoms3u_co2_high_threshold',
        'atoms3u_co2_high_alert',
        'atoms3u_sensor_rig_thermal_camera',
        'atoms3u_thermal_color_palette',
        'atoms3u_thermal_overlay_enable',
        'atoms3u_roi_enabled',
        'atoms3u_roi_center_row',
        'atoms3u_roi_center_column',
        'atoms3u_roi_size'
      ]
    },
    {
      id: 'atlas-hydro-monitor',
      nodeId: 'atlas-hydro-monitor',
      name: 'Atlas Hydro Monitor',
      manufacturer: 'Atlas Scientific',
      model: 'Hydro kit',
      swVersion: 'v0.1.0 (ESPHome 2026.6.2)',
      availability: 'unknown',
      entityIds: [
        'atlas_water_temperature',
        'atlas_water_ph',
        'atlas_enable_ph_circuit',
        'atlas_ph_cal_mid',
        'atlas_restart',
        'atlas_uptime',
        'atlas_firmware_update',
        'atlas_check_firmware_update'
      ]
    },
    ...plugDevices
  ],
  entities: [
    {
      id: 'atoms3u_temperature',
      component: 'sensor',
      name: 'Temperature',
      uniqueId: 'atoms3u_temperature',
      objectId: 'temperature',
      nodeId: 'atoms3u-sensor-rig',
      device: { identifiers: ['atoms3u-sensor-rig'], name: 'AtomS3U Sensor Rig' },
      stateTopic: 'grow/daniel-home/atoms3u-sensor-rig/sensor/temperature/state',
      unit: '°C',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: false,
      raw: {}
    },
    {
      id: 'atoms3u_co2_high_threshold',
      component: 'number',
      name: 'CO2 High Threshold',
      uniqueId: 'atoms3u_co2_high_threshold',
      objectId: 'co2_high_threshold',
      nodeId: 'atoms3u-sensor-rig',
      device: { identifiers: ['atoms3u-sensor-rig'], name: 'AtomS3U Sensor Rig' },
      stateTopic: 'grow/daniel-home/atoms3u-sensor-rig/number/co2_high_threshold/state',
      commandTopic: 'grow/daniel-home/atoms3u-sensor-rig/number/co2_high_threshold/command',
      min: 500,
      max: 2000,
      step: 1,
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: true,
      raw: {}
    },
    {
      id: 'atoms3u_co2_high_alert',
      component: 'binary_sensor',
      name: 'CO2 High Alert',
      uniqueId: 'atoms3u_co2_high_alert',
      objectId: 'co2_high_alert',
      nodeId: 'atoms3u-sensor-rig',
      device: { identifiers: ['atoms3u-sensor-rig'], name: 'AtomS3U Sensor Rig' },
      stateTopic: 'grow/daniel-home/atoms3u-sensor-rig/binary_sensor/co2_high_alert/state',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: false,
      raw: {}
    },
    {
      id: 'atoms3u_sensor_rig_thermal_camera',
      component: 'camera',
      name: 'Thermal Camera',
      uniqueId: 'atoms3u-sensor-rig_thermal_camera',
      objectId: 'thermal_camera',
      nodeId: 'atoms3u-sensor-rig',
      device: {
        identifiers: ['30eda0c8f338'],
        name: 'AtomS3U Sensor Rig',
        manufacturer: 'stackdrift',
        model: 'atoms3u-sensor-rig'
      },
      imagePath: '/thermal.jpg',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: false,
      raw: {}
    },
    {
      id: 'atoms3u_thermal_color_palette',
      component: 'select',
      name: 'Thermal Color Palette',
      uniqueId: 'atoms3u_thermal_color_palette',
      objectId: 'thermal_color_palette',
      nodeId: 'atoms3u-sensor-rig',
      device: {
        identifiers: ['30eda0c8f338'],
        name: 'AtomS3U Sensor Rig',
        manufacturer: 'stackdrift',
        model: 'atoms3u-sensor-rig'
      },
      stateTopic: 'grow/daniel-home/atoms3u-sensor-rig/select/thermal_color_palette/state',
      commandTopic: 'grow/daniel-home/atoms3u-sensor-rig/select/thermal_color_palette/command',
      options: ['ironblack', 'rainbow', 'grayscale'],
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: true,
      raw: {}
    },
    {
      id: 'atoms3u_thermal_overlay_enable',
      component: 'switch',
      name: 'Thermal Overlay Enable',
      uniqueId: 'atoms3u_thermal_overlay_enable',
      objectId: 'thermal_overlay_enable',
      nodeId: 'atoms3u-sensor-rig',
      device: {
        identifiers: ['30eda0c8f338'],
        name: 'AtomS3U Sensor Rig',
        manufacturer: 'stackdrift',
        model: 'atoms3u-sensor-rig'
      },
      stateTopic: 'grow/daniel-home/atoms3u-sensor-rig/switch/thermal_overlay_enable/state',
      commandTopic: 'grow/daniel-home/atoms3u-sensor-rig/switch/thermal_overlay_enable/command',
      payloadOn: 'ON',
      payloadOff: 'OFF',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: true,
      raw: {}
    },
    {
      id: 'atoms3u_roi_enabled',
      component: 'switch',
      name: 'ROI Enabled',
      uniqueId: 'atoms3u_roi_enabled',
      objectId: 'roi_enabled',
      nodeId: 'atoms3u-sensor-rig',
      device: {
        identifiers: ['30eda0c8f338'],
        name: 'AtomS3U Sensor Rig',
        manufacturer: 'stackdrift',
        model: 'atoms3u-sensor-rig'
      },
      stateTopic: 'grow/daniel-home/atoms3u-sensor-rig/switch/roi_enabled/state',
      commandTopic: 'grow/daniel-home/atoms3u-sensor-rig/switch/roi_enabled/command',
      payloadOn: 'ON',
      payloadOff: 'OFF',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: true,
      raw: {}
    },
    {
      id: 'atoms3u_roi_center_row',
      component: 'number',
      name: 'ROI Center Row',
      uniqueId: 'atoms3u_roi_center_row',
      objectId: 'roi_center_row',
      nodeId: 'atoms3u-sensor-rig',
      device: {
        identifiers: ['30eda0c8f338'],
        name: 'AtomS3U Sensor Rig',
        manufacturer: 'stackdrift',
        model: 'atoms3u-sensor-rig'
      },
      stateTopic: 'grow/daniel-home/atoms3u-sensor-rig/number/roi_center_row/state',
      commandTopic: 'grow/daniel-home/atoms3u-sensor-rig/number/roi_center_row/command',
      min: 1,
      max: 24,
      step: 1,
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: true,
      raw: {}
    },
    {
      id: 'atoms3u_roi_center_column',
      component: 'number',
      name: 'ROI Center Column',
      uniqueId: 'atoms3u_roi_center_column',
      objectId: 'roi_center_column',
      nodeId: 'atoms3u-sensor-rig',
      device: {
        identifiers: ['30eda0c8f338'],
        name: 'AtomS3U Sensor Rig',
        manufacturer: 'stackdrift',
        model: 'atoms3u-sensor-rig'
      },
      stateTopic: 'grow/daniel-home/atoms3u-sensor-rig/number/roi_center_column/state',
      commandTopic: 'grow/daniel-home/atoms3u-sensor-rig/number/roi_center_column/command',
      min: 1,
      max: 32,
      step: 1,
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: true,
      raw: {}
    },
    {
      id: 'atoms3u_roi_size',
      component: 'number',
      name: 'ROI Size',
      uniqueId: 'atoms3u_roi_size',
      objectId: 'roi_size',
      nodeId: 'atoms3u-sensor-rig',
      device: {
        identifiers: ['30eda0c8f338'],
        name: 'AtomS3U Sensor Rig',
        manufacturer: 'stackdrift',
        model: 'atoms3u-sensor-rig'
      },
      stateTopic: 'grow/daniel-home/atoms3u-sensor-rig/number/roi_size/state',
      commandTopic: 'grow/daniel-home/atoms3u-sensor-rig/number/roi_size/command',
      min: 1,
      max: 10,
      step: 1,
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: true,
      raw: {}
    },
    {
      id: 'atlas_water_temperature',
      component: 'sensor',
      name: 'Water Temperature',
      uniqueId: 'atlas_water_temperature',
      objectId: 'water_temperature',
      nodeId: 'atlas-hydro-monitor',
      device: { identifiers: ['atlas-hydro-monitor'], name: 'Atlas Hydro Monitor' },
      stateTopic: 'grow/daniel-home/atlas-hydro-monitor/sensor/water_temperature/state',
      unit: '°C',
      deviceClass: 'temperature',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: false,
      raw: {}
    },
    {
      id: 'atlas_water_ph',
      component: 'sensor',
      name: 'Water pH',
      uniqueId: 'atlas_water_ph',
      objectId: 'water_ph',
      nodeId: 'atlas-hydro-monitor',
      device: { identifiers: ['atlas-hydro-monitor'], name: 'Atlas Hydro Monitor' },
      stateTopic: 'grow/daniel-home/atlas-hydro-monitor/sensor/water_ph/state',
      unit: 'pH',
      deviceClass: 'ph',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: false,
      raw: {}
    },
    {
      id: 'atlas_ph_cal_mid',
      component: 'button',
      name: 'pH Cal Mid (7.00)',
      uniqueId: 'atlas_ph_cal_mid',
      objectId: 'ph_cal_mid__7_00_',
      nodeId: 'atlas-hydro-monitor',
      device: { identifiers: ['atlas-hydro-monitor'], name: 'Atlas Hydro Monitor' },
      commandTopic: 'grow/daniel-home/atlas-hydro-monitor/button/ph_cal_mid/command',
      payloadPress: 'PRESS',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: true,
      writable: true,
      raw: {}
    },
    {
      id: 'atlas_enable_ph_circuit',
      component: 'switch',
      name: 'Enable pH Circuit',
      uniqueId: 'atlas_enable_ph_circuit',
      objectId: 'enable_ph_circuit',
      nodeId: 'atlas-hydro-monitor',
      device: { identifiers: ['atlas-hydro-monitor'], name: 'Atlas Hydro Monitor' },
      stateTopic: 'grow/daniel-home/atlas-hydro-monitor/switch/enable_ph_circuit/state',
      commandTopic: 'grow/daniel-home/atlas-hydro-monitor/switch/enable_ph_circuit/command',
      payloadOn: 'ON',
      payloadOff: 'OFF',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: true,
      raw: {}
    },
    {
      id: 'atlas_restart',
      component: 'button',
      name: 'Restart',
      uniqueId: 'atlas_restart',
      objectId: 'restart_device',
      nodeId: 'atlas-hydro-monitor',
      device: { identifiers: ['atlas-hydro-monitor'], name: 'Atlas Hydro Monitor' },
      commandTopic: 'grow/daniel-home/atlas-hydro-monitor/button/restart/command',
      payloadPress: 'PRESS',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: true,
      writable: true,
      raw: {}
    },
    {
      id: 'atlas_uptime',
      component: 'sensor',
      name: 'Uptime',
      uniqueId: 'atlas_uptime',
      objectId: 'uptime',
      nodeId: 'atlas-hydro-monitor',
      device: { identifiers: ['atlas-hydro-monitor'], name: 'Atlas Hydro Monitor' },
      stateTopic: 'grow/daniel-home/atlas-hydro-monitor/sensor/uptime/state',
      entityCategory: 'diagnostic',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: false,
      raw: {}
    },
    {
      id: 'atlas_firmware_update',
      component: 'update',
      name: 'Firmware Update',
      uniqueId: 'atlas_firmware_update',
      objectId: 'firmware_update',
      nodeId: 'atlas-hydro-monitor',
      device: { identifiers: ['atlas-hydro-monitor'], name: 'Atlas Hydro Monitor' },
      stateTopic: 'grow/daniel-home/atlas-hydro-monitor/update/firmware_update/state',
      commandTopic: 'grow/daniel-home/atlas-hydro-monitor/update/firmware_update/command',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: true,
      raw: {}
    },
    {
      id: 'atlas_check_firmware_update',
      component: 'button',
      name: 'Check Firmware Update',
      uniqueId: 'atlas_check_firmware_update',
      objectId: 'check_firmware_update',
      nodeId: 'atlas-hydro-monitor',
      device: { identifiers: ['atlas-hydro-monitor'], name: 'Atlas Hydro Monitor' },
      commandTopic: 'grow/daniel-home/atlas-hydro-monitor/button/check_firmware_update/command',
      payloadPress: 'PRESS',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: true,
      writable: true,
      raw: {}
    },
    ...plugEntities
  ],
  states: {
    ...plugStates,
    atoms3u_temperature: {
      value: '24.8',
      updatedAt: new Date('2026-06-13T12:00:00Z').toISOString()
    },
    atoms3u_co2_high_threshold: {
      value: '1500',
      updatedAt: new Date('2026-06-13T12:00:00Z').toISOString()
    },
    atoms3u_co2_high_alert: {
      value: 'OFF',
      updatedAt: new Date('2026-06-13T12:00:00Z').toISOString()
    },
    atoms3u_thermal_color_palette: {
      value: 'ironblack',
      updatedAt: new Date('2026-06-13T12:00:00Z').toISOString()
    },
    atoms3u_thermal_overlay_enable: {
      value: 'OFF',
      updatedAt: new Date('2026-06-13T12:00:00Z').toISOString()
    },
    atoms3u_roi_enabled: {
      value: 'OFF',
      updatedAt: new Date('2026-06-13T12:00:00Z').toISOString()
    },
    atoms3u_roi_center_row: {
      value: '6',
      updatedAt: new Date('2026-06-13T12:00:00Z').toISOString()
    },
    atoms3u_roi_center_column: {
      value: '8',
      updatedAt: new Date('2026-06-13T12:00:00Z').toISOString()
    },
    atoms3u_roi_size: {
      value: '3.000000',
      updatedAt: new Date('2026-06-13T12:00:00Z').toISOString()
    },
    atlas_water_temperature: {
      value: '22.1',
      updatedAt: new Date('2026-06-13T12:00:00Z').toISOString()
    },
    atlas_water_ph: { value: '6.42', updatedAt: new Date('2026-06-13T12:00:00Z').toISOString() },
    atlas_enable_ph_circuit: {
      value: 'ON',
      updatedAt: new Date('2026-06-13T12:00:00Z').toISOString()
    },
    atlas_uptime: { value: '1h', updatedAt: new Date('2026-06-13T12:00:00Z').toISOString() },
    atlas_firmware_update: {
      value: JSON.stringify({
        state: 'ON',
        installed_version: 'v0.1.0',
        latest_version: 'v0.2.0',
        release_summary: 'Two firmware changes',
        release_url: 'https://github.com/dephekt/grow-fleet/commit/0123456789abcdef'
      }),
      updatedAt: new Date('2026-06-13T12:00:00Z').toISOString()
    }
  },
  uiConfigs: {
    'atoms3u-sensor-rig': {
      schema: 'grow-ui.v1',
      nodeId: 'atoms3u-sensor-rig',
      groups: [
        {
          id: 'overview',
          title: 'Environment',
          order: 0,
          variant: 'metrics',
          surface: 'dashboard',
          defaultOpen: true
        },
        {
          id: 'thermal_view',
          title: 'Thermal Camera',
          order: 15,
          variant: 'camera',
          surface: 'dashboard',
          defaultOpen: true
        },
        {
          id: 'thresholds',
          title: 'Thresholds & Alerts',
          order: 20,
          surface: 'device-settings',
          deviceSettingsSection: 'alerts',
          defaultOpen: false
        }
      ],
      entities: [
        {
          component: 'sensor',
          objectId: 'temperature',
          group: 'overview',
          role: 'metric',
          order: 10
        },
        {
          component: 'camera',
          objectId: 'thermal_camera',
          group: 'thermal_view',
          role: 'camera',
          order: 10,
          label: 'Thermal Camera'
        },
        {
          component: 'select',
          objectId: 'thermal_color_palette',
          group: 'thermal_view',
          role: 'quick-control',
          order: 20
        },
        {
          component: 'switch',
          objectId: 'thermal_overlay_enable',
          group: 'thermal_view',
          role: 'quick-control',
          order: 30
        },
        {
          component: 'switch',
          objectId: 'roi_enabled',
          group: 'thermal_view',
          role: 'quick-control',
          order: 40
        },
        {
          component: 'number',
          objectId: 'roi_center_row',
          group: 'thermal_view',
          role: 'quick-control',
          order: 50
        },
        {
          component: 'number',
          objectId: 'roi_center_column',
          group: 'thermal_view',
          role: 'quick-control',
          order: 60
        },
        {
          component: 'number',
          objectId: 'roi_size',
          group: 'thermal_view',
          role: 'quick-control',
          order: 70
        },
        { component: 'number', objectId: 'co2_high_threshold', group: 'thresholds', order: 10 },
        { component: 'binary_sensor', objectId: 'co2_high_alert', group: 'thresholds', order: 20 }
      ]
    },
    'atlas-hydro-monitor': {
      schema: 'grow-ui.v1',
      nodeId: 'atlas-hydro-monitor',
      groups: [
        {
          id: 'overview',
          title: 'Key Readings',
          order: 0,
          variant: 'metrics',
          surface: 'dashboard',
          defaultOpen: true
        },
        {
          id: 'controls',
          title: 'Circuit Controls',
          order: 20,
          surface: 'device-settings',
          deviceSettingsSection: 'controls',
          defaultOpen: false
        },
        {
          id: 'ph_cal',
          title: 'pH Calibration',
          order: 40,
          surface: 'device-settings',
          deviceSettingsSection: 'calibration',
          defaultOpen: false
        },
        {
          id: 'maintenance',
          title: 'Maintenance',
          order: 80,
          surface: 'device-settings',
          deviceSettingsSection: 'maintenance',
          defaultOpen: false
        }
      ],
      entities: [
        {
          component: 'sensor',
          objectId: 'water_temperature',
          group: 'overview',
          role: 'metric',
          order: 10,
          label: 'Water Temp'
        },
        {
          component: 'sensor',
          objectId: 'water_ph',
          group: 'overview',
          role: 'metric',
          order: 20,
          label: 'Water pH'
        },
        {
          component: 'switch',
          objectId: 'enable_ph_circuit',
          group: 'controls',
          role: 'quick-control',
          order: 10
        },
        {
          component: 'button',
          objectId: 'ph_cal_mid__7_00_',
          group: 'ph_cal',
          order: 10,
          label: 'pH Mid Point'
        },
        {
          component: 'button',
          objectId: 'restart_device',
          group: 'maintenance',
          order: 90,
          label: 'Restart Device'
        }
      ]
    }
  },
  lights: [],
  firmware: {
    devices: {
      'atlas-hydro-monitor': {
        schema: 'grow-firmware-device.v1',
        nodeId: 'atlas-hydro-monitor',
        projectName: 'stackdrift.atlas-hydro-kit',
        packageOwner: 'stackdrift',
        package: 'atlas-hydro-kit',
        device: 'atlas-hydro-kit',
        chipFamily: 'ESP32',
        installedVersion: 'v0.1.0',
        manifestUrl: 'http://192.168.8.3:3080/api/firmware/devices/atlas-hydro-monitor/manifest'
      }
    },
    channels: {}
  }
} satisfies Snapshot;
