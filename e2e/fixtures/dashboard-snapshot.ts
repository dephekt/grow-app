import type { Snapshot } from '../../src/lib/server/mqtt/types';

export const dashboardSnapshot = {
  site: 'daniel-home',
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
      entityIds: ['atoms3u_temperature', 'atoms3u_co2_high_threshold', 'atoms3u_co2_high_alert']
    },
    {
      id: 'atlas-hydro-monitor',
      nodeId: 'atlas-hydro-monitor',
      name: 'Atlas Hydro Monitor',
      manufacturer: 'Atlas Scientific',
      model: 'Hydro kit',
      availability: 'unknown',
      entityIds: [
        'atlas_water_temperature',
        'atlas_water_ph',
        'atlas_enable_ph_circuit',
        'atlas_ph_cal_mid',
        'atlas_restart',
        'atlas_uptime'
      ]
    }
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
    }
  ],
  states: {
    atoms3u_temperature: { value: '24.8', updatedAt: new Date('2026-06-13T12:00:00Z').toISOString() },
    atoms3u_co2_high_threshold: { value: '1500', updatedAt: new Date('2026-06-13T12:00:00Z').toISOString() },
    atoms3u_co2_high_alert: { value: 'OFF', updatedAt: new Date('2026-06-13T12:00:00Z').toISOString() },
    atlas_water_temperature: { value: '22.1', updatedAt: new Date('2026-06-13T12:00:00Z').toISOString() },
    atlas_water_ph: { value: '6.42', updatedAt: new Date('2026-06-13T12:00:00Z').toISOString() },
    atlas_enable_ph_circuit: { value: 'ON', updatedAt: new Date('2026-06-13T12:00:00Z').toISOString() },
    atlas_uptime: { value: '1h', updatedAt: new Date('2026-06-13T12:00:00Z').toISOString() }
  },
  uiConfigs: {
    'atoms3u-sensor-rig': {
      schema: 'grow-ui.v1',
      nodeId: 'atoms3u-sensor-rig',
      groups: [
        { id: 'overview', title: 'Environment', order: 0, variant: 'metrics', surface: 'dashboard', defaultOpen: true },
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
        { component: 'sensor', objectId: 'temperature', group: 'overview', role: 'metric', order: 10 },
        { component: 'number', objectId: 'co2_high_threshold', group: 'thresholds', order: 10 },
        { component: 'binary_sensor', objectId: 'co2_high_alert', group: 'thresholds', order: 20 }
      ]
    },
    'atlas-hydro-monitor': {
      schema: 'grow-ui.v1',
      nodeId: 'atlas-hydro-monitor',
      groups: [
        { id: 'overview', title: 'Key Readings', order: 0, variant: 'metrics', surface: 'dashboard', defaultOpen: true },
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
        { component: 'sensor', objectId: 'water_ph', group: 'overview', role: 'metric', order: 20, label: 'Water pH' },
        { component: 'switch', objectId: 'enable_ph_circuit', group: 'controls', role: 'quick-control', order: 10 },
        { component: 'button', objectId: 'ph_cal_mid__7_00_', group: 'ph_cal', order: 10, label: 'pH Mid Point' },
        { component: 'button', objectId: 'restart_device', group: 'maintenance', order: 90, label: 'Restart Device' }
      ]
    }
  }
} satisfies Snapshot;
