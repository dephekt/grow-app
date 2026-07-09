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

const cameraWithoutFrameSource = {
  id: 'atoms3u_sensor_rig_generic_camera',
  component: 'camera',
  name: 'Generic Camera',
  uniqueId: 'atoms3u-sensor-rig_generic_camera',
  objectId: 'generic_camera',
  nodeId: 'atoms3u-sensor-rig',
  device: { identifiers: ['30eda0c8f338'], name: 'AtomS3U Sensor Rig', manufacturer: 'stackdrift', model: 'atoms3u-sensor-rig' },
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

function makeAtomEntity(
  overrides: Partial<EntityConfig> & { id: string; component: string; name: string; objectId: string }
): EntityConfig {
  return {
    uniqueId: overrides.id,
    nodeId: 'atoms3u-sensor-rig',
    device: { identifiers: ['30eda0c8f338'], name: 'AtomS3U Sensor Rig', manufacturer: 'stackdrift', model: 'atoms3u-sensor-rig' },
    payloadAvailable: 'online',
    payloadNotAvailable: 'offline',
    dangerous: false,
    writable: false,
    raw: {},
    ...overrides
  };
}

const thermalQuickControlEntities = [
  makeAtomEntity({
    id: 'atoms3u_thermal_color_palette',
    component: 'select',
    name: 'Thermal Color Palette',
    objectId: 'thermal_color_palette',
    commandTopic: 'grow/daniel-home/atoms3u-sensor-rig/select/thermal_color_palette/command',
    options: ['ironblack', 'rainbow'],
    writable: true
  }),
  makeAtomEntity({
    id: 'atoms3u_thermal_overlay_enable',
    component: 'switch',
    name: 'Thermal Overlay Enable',
    objectId: 'thermal_overlay_enable',
    commandTopic: 'grow/daniel-home/atoms3u-sensor-rig/switch/thermal_overlay_enable/command',
    payloadOn: 'ON',
    payloadOff: 'OFF',
    writable: true
  }),
  makeAtomEntity({
    id: 'atoms3u_roi_enabled',
    component: 'switch',
    name: 'ROI Enabled',
    objectId: 'roi_enabled',
    commandTopic: 'grow/daniel-home/atoms3u-sensor-rig/switch/roi_enabled/command',
    payloadOn: 'ON',
    payloadOff: 'OFF',
    writable: true
  }),
  makeAtomEntity({
    id: 'atoms3u_roi_center_row',
    component: 'number',
    name: 'ROI Center Row',
    objectId: 'roi_center_row',
    commandTopic: 'grow/daniel-home/atoms3u-sensor-rig/number/roi_center_row/command',
    min: 1,
    max: 24,
    step: 1,
    writable: true
  }),
  makeAtomEntity({
    id: 'atoms3u_roi_center_column',
    component: 'number',
    name: 'ROI Center Column',
    objectId: 'roi_center_column',
    commandTopic: 'grow/daniel-home/atoms3u-sensor-rig/number/roi_center_column/command',
    min: 1,
    max: 32,
    step: 1,
    writable: true
  }),
  makeAtomEntity({
    id: 'atoms3u_roi_size',
    component: 'number',
    name: 'ROI Size',
    objectId: 'roi_size',
    commandTopic: 'grow/daniel-home/atoms3u-sensor-rig/number/roi_size/command',
    min: 1,
    max: 10,
    step: 1,
    writable: true
  })
];

const thermalMeanEntity = makeAtomEntity({
  id: 'atoms3u_mlx90640_mean_temp',
  component: 'sensor',
  name: 'MLX90640 Mean temp',
  objectId: 'mlx90640_mean_temp'
});

const thermalUpdateIntervalEntity = makeAtomEntity({
  id: 'atoms3u_thermal_update_interval',
  component: 'number',
  name: 'Thermal Update Interval',
  objectId: 'thermal_update_interval',
  commandTopic: 'grow/daniel-home/atoms3u-sensor-rig/number/thermal_update_interval/command',
  min: 100,
  max: 30000,
  step: 100,
  writable: true
});

const unrelatedQuickControlEntity = makeAtomEntity({
  id: 'atoms3u_co2_high_threshold',
  component: 'number',
  name: 'CO2 High Threshold',
  objectId: 'co2_high_threshold',
  commandTopic: 'grow/daniel-home/atoms3u-sensor-rig/number/co2_high_threshold/command',
  min: 500,
  max: 2000,
  step: 1,
  writable: true
});

const thermalQuickControlObjectIds = [
  'thermal_color_palette',
  'thermal_overlay_enable',
  'roi_enabled',
  'roi_center_row',
  'roi_center_column',
  'roi_size'
];

const device = {
  id: '30eda0c8f338',
  nodeId: 'atoms3u-sensor-rig',
  name: 'AtomS3U Sensor Rig',
  manufacturer: 'stackdrift',
  model: 'atoms3u-sensor-rig',
  availability: 'online' as const,
  entityIds: [cameraEntity.id, temperatureEntity.id]
};

function makeSnapshot(uiConfigs: Snapshot['uiConfigs'] = {}, overrides: Partial<Snapshot> = {}): Snapshot {
  const snapshot = {
    site: 'daniel-home',
    topicPrefix: 'grow/daniel-home',
    discoveryPrefix: 'grow/daniel-home/_discovery',
    generatedAt: new Date().toISOString(),
    broker: { connected: true, connecting: false, error: null, lastConnectedAt: null, lastMessageAt: null },
    devices: [device],
    entities: [cameraEntity, temperatureEntity],
    states: {},
    uiConfigs,
    lights: [],
    firmware: { devices: {}, channels: {} }
  };
  return { ...snapshot, ...overrides };
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
    expect(presentation.cameras[0].entry.entity.id).toBe(cameraEntity.id);
    expect(presentation.cameras[0].entry.label).toBe('Thermal Camera');
    expect(presentation.metrics.map((e) => e.entity.id)).not.toContain(cameraEntity.id);
  });

  it('places camera in cameras array and not in metrics — fallback (no ui config)', () => {
    const snapshot = makeSnapshot();

    const presentation = dashboardPresentation(snapshot, device);

    expect(presentation.cameras).toHaveLength(1);
    expect(presentation.cameras[0].entry.entity.id).toBe(cameraEntity.id);
    expect(presentation.cameras[0].quickControls).toEqual([]);
    expect(presentation.metrics.map((e) => e.entity.id)).not.toContain(cameraEntity.id);
  });

  it('omits camera entities that do not expose a frame source', () => {
    const snapshot = {
      ...makeSnapshot(),
      devices: [{ ...device, entityIds: [cameraWithoutFrameSource.id, temperatureEntity.id] }],
      entities: [cameraWithoutFrameSource, temperatureEntity]
    } satisfies Snapshot;

    const presentation = dashboardPresentation(snapshot, snapshot.devices[0]);

    expect(presentation.cameras).toHaveLength(0);
    expect(presentation.metrics.map((e) => e.entity.id)).not.toContain(cameraWithoutFrameSource.id);
  });

  it('attaches same-group thermal quick controls to the camera tile and leaves unrelated quick controls generic', () => {
    const deviceWithControls = {
      ...device,
      entityIds: [
        cameraEntity.id,
        temperatureEntity.id,
        unrelatedQuickControlEntity.id,
        ...thermalQuickControlEntities.map((entity) => entity.id)
      ]
    };
    const snapshot = makeSnapshot(
      {
        'atoms3u-sensor-rig': {
          schema: 'grow-ui.v1',
          nodeId: 'atoms3u-sensor-rig',
          groups: [
            { id: 'overview', title: 'Environment', order: 0, variant: 'metrics', surface: 'dashboard', defaultOpen: true },
            { id: 'thermal_view', title: 'Thermal Camera', order: 15, variant: 'camera', surface: 'dashboard', defaultOpen: true },
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
            { component: 'camera', objectId: 'thermal_camera', group: 'thermal_view', role: 'camera', order: 10, label: 'Thermal Camera' },
            { component: 'select', objectId: 'thermal_color_palette', group: 'thermal_view', role: 'quick-control', order: 20 },
            { component: 'switch', objectId: 'thermal_overlay_enable', group: 'thermal_view', role: 'quick-control', order: 30 },
            { component: 'switch', objectId: 'roi_enabled', group: 'thermal_view', role: 'quick-control', order: 40 },
            { component: 'number', objectId: 'roi_center_row', group: 'thermal_view', role: 'quick-control', order: 50 },
            { component: 'number', objectId: 'roi_center_column', group: 'thermal_view', role: 'quick-control', order: 60 },
            { component: 'number', objectId: 'roi_size', group: 'thermal_view', role: 'quick-control', order: 70 },
            { component: 'number', objectId: 'co2_high_threshold', group: 'thresholds', role: 'quick-control', order: 10 }
          ]
        }
      },
      {
        devices: [deviceWithControls],
        entities: [cameraEntity, temperatureEntity, unrelatedQuickControlEntity, ...thermalQuickControlEntities]
      }
    );

    const presentation = dashboardPresentation(snapshot, deviceWithControls);

    expect(presentation.cameras).toHaveLength(1);
    expect(presentation.cameras[0].quickControls.map((entry) => entry.entity.objectId)).toEqual(thermalQuickControlObjectIds);
    expect(presentation.quickControls.map((entry) => entry.entity.objectId)).toEqual(['co2_high_threshold']);
    expect(presentation.quickControls.map((entry) => entry.entity.objectId)).not.toContain('roi_center_row');
    expect(presentation.quickControls.map((entry) => entry.entity.objectId)).not.toContain('roi_center_column');
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

  it('camera does not appear in settings when grow-ui assigns it to a settings group', () => {
    const snapshot = makeSnapshot({
      'atoms3u-sensor-rig': {
        schema: 'grow-ui.v1',
        nodeId: 'atoms3u-sensor-rig',
        groups: [{ id: 'thermal_view', title: 'Thermal Camera', order: 15, variant: 'camera', surface: 'device-settings', defaultOpen: true }],
        entities: [{ component: 'camera', objectId: 'thermal_camera', group: 'thermal_view', role: 'camera', order: 10 }]
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

  it('omits dashboard-grouped thermal quick controls from settings fallback while keeping thermal settings entries', () => {
    const deviceWithThermalSettings = {
      ...device,
      entityIds: [
        cameraEntity.id,
        temperatureEntity.id,
        thermalMeanEntity.id,
        thermalUpdateIntervalEntity.id,
        ...thermalQuickControlEntities.map((entity) => entity.id)
      ]
    };
    const snapshot = makeSnapshot(
      {
        'atoms3u-sensor-rig': {
          schema: 'grow-ui.v1',
          nodeId: 'atoms3u-sensor-rig',
          groups: [
            { id: 'thermal_view', title: 'Thermal Camera', order: 15, variant: 'camera', surface: 'dashboard', defaultOpen: true },
            {
              id: 'thermal',
              title: 'Thermal Camera',
              order: 30,
              surface: 'device-settings',
              deviceSettingsSection: 'controls',
              defaultOpen: false
            }
          ],
          entities: [
            { component: 'camera', objectId: 'thermal_camera', group: 'thermal_view', role: 'camera', order: 10 },
            { component: 'sensor', objectId: 'mlx90640_mean_temp', group: 'thermal', order: 20 },
            { component: 'select', objectId: 'thermal_color_palette', group: 'thermal_view', role: 'quick-control', order: 20 },
            { component: 'switch', objectId: 'thermal_overlay_enable', group: 'thermal_view', role: 'quick-control', order: 30 },
            { component: 'switch', objectId: 'roi_enabled', group: 'thermal_view', role: 'quick-control', order: 40 },
            { component: 'number', objectId: 'roi_center_row', group: 'thermal_view', role: 'quick-control', order: 50 },
            { component: 'number', objectId: 'roi_center_column', group: 'thermal_view', role: 'quick-control', order: 60 },
            { component: 'number', objectId: 'roi_size', group: 'thermal_view', role: 'quick-control', order: 70 },
            { component: 'number', objectId: 'thermal_update_interval', group: 'thermal', order: 70 }
          ]
        }
      },
      {
        devices: [deviceWithThermalSettings],
        entities: [cameraEntity, temperatureEntity, thermalMeanEntity, thermalUpdateIntervalEntity, ...thermalQuickControlEntities]
      }
    );

    const panels = deviceSettingsPresentation(snapshot, deviceWithThermalSettings);
    const groups = panels.flatMap((panel) => panel.groups);
    const allObjectIds = groups.flatMap((group) => group.entries.map((entry) => entry.entity.objectId));
    const thermalGroup = groups.find((group) => group.id === 'thermal');

    expect(allObjectIds).not.toEqual(expect.arrayContaining(thermalQuickControlObjectIds));
    expect(thermalGroup?.entries.map((entry) => entry.entity.objectId)).toEqual(['mlx90640_mean_temp', 'thermal_update_interval']);
  });
});

describe('deviceSettingsPresentation diagnostics folding', () => {
  const wifi = makeAtomEntity({
    id: 'atoms3u_wifi_signal',
    component: 'sensor',
    name: 'WiFi Signal',
    objectId: 'wifi_signal',
    entityCategory: 'diagnostic'
  });
  // Uncurated diagnostic entity (not in _ui/config) — like the plug's MAC Address.
  const mac = makeAtomEntity({
    id: 'atoms3u_mac_address',
    component: 'sensor',
    name: 'MAC Address',
    objectId: 'mac_address',
    entityCategory: 'diagnostic'
  });
  const diagDevice = { ...device, entityIds: [wifi.id, mac.id] };
  const uiConfigs = {
    'atoms3u-sensor-rig': {
      schema: 'grow-ui.v1' as const,
      nodeId: 'atoms3u-sensor-rig',
      groups: [
        {
          id: 'diagnostics',
          title: 'Diagnostics',
          order: 90,
          surface: 'device-settings',
          deviceSettingsSection: 'diagnostics',
          defaultOpen: false
        }
      ],
      entities: [{ component: 'sensor', objectId: 'wifi_signal', group: 'diagnostics', order: 10 }]
    }
  };

  it('folds an uncurated diagnostic entity into the curated Diagnostics section (no duplicate tab section)', () => {
    const snapshot = makeSnapshot(uiConfigs, { devices: [diagDevice], entities: [wifi, mac] });
    const panels = deviceSettingsPresentation(snapshot, diagDevice);
    const diagnostics = panels.find((panel) => panel.id === 'diagnostics');

    expect(diagnostics).toBeDefined();
    // Exactly one collapsible titled "Diagnostics", not two.
    expect(diagnostics!.groups).toHaveLength(1);
    expect(diagnostics!.groups[0].title).toBe('Diagnostics');
    expect(diagnostics!.groups[0].entries.map((entry) => entry.entity.objectId)).toEqual(['wifi_signal', 'mac_address']);
  });
});
