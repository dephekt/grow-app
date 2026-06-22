import { describe, expect, it } from 'vitest';
import { dashboardPresentation, deviceSettingsPresentation } from '../../src/lib/device-presentation';
import type { EntityConfig, Snapshot } from '../../src/lib/server/mqtt/types';

const cameraEntity = {
  id: 'atoms3u_sensor_rig_thermal_camera',
  component: 'camera',
  name: 'Thermal Camera',
  uniqueId: 'atoms3u-sensor-rig_thermal_camera',
  objectId: 'thermal_camera',
  nodeId: 'atoms3u-sensor-rig',
  device: { identifiers: ['30eda0c8f338'], name: 'AtomS3U Sensor Rig', manufacturer: 'stackdrift', model: 'atoms3u-sensor-rig' },
  imagePath: '/thermal.jpg',
  payloadAvailable: 'online',
  payloadNotAvailable: 'offline',
  dangerous: false,
  writable: false,
  raw: {}
} satisfies EntityConfig;

const temperatureEntity = {
  id: 'atoms3u_temperature',
  component: 'sensor',
  name: 'Temperature',
  uniqueId: 'atoms3u_temperature',
  objectId: 'temperature',
  nodeId: 'atoms3u-sensor-rig',
  device: { identifiers: ['30eda0c8f338'], name: 'AtomS3U Sensor Rig', manufacturer: 'stackdrift', model: 'atoms3u-sensor-rig' },
  stateTopic: 'grow/daniel-home/atoms3u-sensor-rig/sensor/temperature/state',
  unit: '°C',
  payloadAvailable: 'online',
  payloadNotAvailable: 'offline',
  dangerous: false,
  writable: false,
  raw: {}
} satisfies EntityConfig;

const device = {
  id: '30eda0c8f338',
  nodeId: 'atoms3u-sensor-rig',
  name: 'AtomS3U Sensor Rig',
  manufacturer: 'stackdrift',
  model: 'atoms3u-sensor-rig',
  availability: 'online' as const,
  entityIds: [cameraEntity.id, temperatureEntity.id]
};

function makeSnapshot(uiConfigs: Snapshot['uiConfigs'] = {}): Snapshot {
  return {
    site: 'daniel-home',
    topicPrefix: 'grow/daniel-home',
    discoveryPrefix: 'grow/daniel-home/_discovery',
    generatedAt: new Date().toISOString(),
    broker: { connected: true, connecting: false, error: null, lastConnectedAt: null, lastMessageAt: null },
    devices: [device],
    entities: [cameraEntity, temperatureEntity],
    states: {},
    uiConfigs,
    firmware: { devices: {}, channels: {} }
  };
}

describe('dashboardPresentation with camera entity', () => {
  it('places camera in cameras array and not in metrics — with grow-ui config', () => {
    const snapshot = makeSnapshot({
      'atoms3u-sensor-rig': {
        schema: 'grow-ui.v1',
        nodeId: 'atoms3u-sensor-rig',
        groups: [
          { id: 'overview', title: 'Environment', order: 0, variant: 'metrics', surface: 'dashboard', defaultOpen: true },
          { id: 'thermal_view', title: 'Thermal Camera', order: 15, variant: 'camera', surface: 'dashboard', defaultOpen: true }
        ],
        entities: [
          { component: 'sensor', objectId: 'temperature', group: 'overview', role: 'metric', order: 10 },
          { component: 'camera', objectId: 'thermal_camera', group: 'thermal_view', role: 'camera', order: 10, label: 'Thermal Camera' }
        ]
      }
    });

    const presentation = dashboardPresentation(snapshot, device);

    expect(presentation.cameras).toHaveLength(1);
    expect(presentation.cameras[0].entity.id).toBe(cameraEntity.id);
    expect(presentation.cameras[0].label).toBe('Thermal Camera');
    expect(presentation.metrics.map((e) => e.entity.id)).not.toContain(cameraEntity.id);
  });

  it('places camera in cameras array and not in metrics — fallback (no ui config)', () => {
    const snapshot = makeSnapshot();

    const presentation = dashboardPresentation(snapshot, device);

    expect(presentation.cameras).toHaveLength(1);
    expect(presentation.cameras[0].entity.id).toBe(cameraEntity.id);
    expect(presentation.metrics.map((e) => e.entity.id)).not.toContain(cameraEntity.id);
  });
});

describe('deviceSettingsPresentation with camera entity', () => {
  it('camera does not appear in any settings panel — with grow-ui config', () => {
    const snapshot = makeSnapshot({
      'atoms3u-sensor-rig': {
        schema: 'grow-ui.v1',
        nodeId: 'atoms3u-sensor-rig',
        groups: [
          { id: 'overview', title: 'Environment', order: 0, variant: 'metrics', surface: 'dashboard', defaultOpen: true },
          { id: 'thermal_view', title: 'Thermal Camera', order: 15, variant: 'camera', surface: 'dashboard', defaultOpen: true }
        ],
        entities: [
          { component: 'sensor', objectId: 'temperature', group: 'overview', role: 'metric', order: 10 },
          { component: 'camera', objectId: 'thermal_camera', group: 'thermal_view', role: 'camera', order: 10 }
        ]
      }
    });

    const panels = deviceSettingsPresentation(snapshot, device);
    const allEntryIds = panels.flatMap((panel) => panel.groups.flatMap((group) => group.entries.map((e) => e.entity.id)));

    expect(allEntryIds).not.toContain(cameraEntity.id);
  });

  it('camera does not appear in any settings panel — fallback (no ui config)', () => {
    const snapshot = makeSnapshot();

    const panels = deviceSettingsPresentation(snapshot, device);
    const allEntryIds = panels.flatMap((panel) => panel.groups.flatMap((group) => group.entries.map((e) => e.entity.id)));

    expect(allEntryIds).not.toContain(cameraEntity.id);
  });
});
