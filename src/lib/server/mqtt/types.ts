export type EntityComponent =
  | 'sensor'
  | 'binary_sensor'
  | 'switch'
  | 'number'
  | 'select'
  | 'button'
  | 'text'
  | 'light'
  | 'fan'
  | 'camera'
  | string;

export type AvailabilityState = 'online' | 'offline' | 'unknown';

export interface DiscoveryDevice {
  identifiers: string[];
  name: string;
  manufacturer?: string;
  model?: string;
  swVersion?: string;
}

export interface EntityConfig {
  id: string;
  component: EntityComponent;
  name: string;
  uniqueId: string;
  objectId?: string;
  nodeId?: string;
  device: DiscoveryDevice;
  stateTopic?: string;
  imagePath?: string;
  imageUrl?: string;
  commandTopic?: string;
  availabilityTopic?: string;
  unit?: string;
  deviceClass?: string;
  stateClass?: string;
  suggestedDisplayPrecision?: number;
  entityCategory?: string;
  icon?: string;
  payloadOn?: string;
  payloadOff?: string;
  payloadPress?: string;
  payloadAvailable: string;
  payloadNotAvailable: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  dangerous: boolean;
  writable: boolean;
  raw: Record<string, unknown>;
}

export interface DeviceSnapshot {
  id: string;
  nodeId: string;
  name: string;
  manufacturer?: string;
  model?: string;
  swVersion?: string;
  availability: AvailabilityState;
  entityIds: string[];
}

export interface DeviceUiGroup {
  id: string;
  title: string;
  order: number;
  variant?: 'metrics' | 'list' | string;
  surface?: 'dashboard' | 'device-settings' | string;
  deviceSettingsSection?: 'controls' | 'alerts' | 'calibration' | 'maintenance' | 'diagnostics' | 'other' | string;
  defaultOpen: boolean;
}

export interface DeviceUiEntity {
  component: string;
  objectId: string;
  group: string;
  role?: 'metric' | 'quick-control' | string;
  order: number;
  label?: string;
}

export interface DeviceUiConfig {
  schema: 'grow-ui.v1';
  nodeId: string;
  groups: DeviceUiGroup[];
  entities: DeviceUiEntity[];
}

/**
 * A logical light is assembled from controls scattered across devices: on/off,
 * schedule, and power live on a smart plug; the dimmer lives on a DAC channel on a
 * different node. Each device publishes a `grow-lights.v1` fragment declaring which
 * of ITS entities fill which role for a light id; the server merges fragments by id
 * into `LightConfig`s. A resolved role points at one entity on one node.
 */
export interface LightRoleRef {
  node: string;
  objectId: string;
}

export interface LightRoles {
  power?: LightRoleRef;
  scheduleArm?: LightRoleRef;
  onTime?: LightRoleRef;
  offTime?: LightRoleRef;
  dimmer?: LightRoleRef;
  metrics?: LightRoleRef[];
}

export interface LightConfig {
  id: string;
  name: string;
  type?: string;
  order: number;
  roles: LightRoles;
}

/** A single device's raw contribution, as published to `<node>/_lights/config`.
 *  Role values are objectIds LOCAL to `nodeId`; the merge stamps them with node. */
export interface DeviceLightsFragment {
  schema: 'grow-lights.v1';
  nodeId: string;
  lights: Array<{
    id: string;
    name?: string;
    type?: string;
    order?: number;
    roles: Record<string, string | string[]>;
  }>;
}

export type FirmwareChannel = 'stable' | 'edge';

export interface FirmwareDeviceConfig {
  schema: 'grow-firmware-device.v1';
  nodeId: string;
  projectName: string;
  packageOwner: string;
  package: string;
  device: string;
  chipFamily: string;
  installedVersion?: string;
  manifestUrl?: string;
}

export interface FirmwareChannelConfig {
  schema: 'grow-firmware-channel.v1';
  nodeId: string;
  channel: FirmwareChannel;
  updatedAt: string;
}

export interface FirmwareSnapshot {
  devices: Record<string, FirmwareDeviceConfig>;
  channels: Record<string, FirmwareChannelConfig>;
}

export interface EntityState {
  value: string | null;
  updatedAt: string | null;
}

export interface BrokerSnapshot {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
}

export interface Snapshot {
  site: string;
  timezone: string;
  topicPrefix: string;
  discoveryPrefix: string;
  generatedAt: string;
  broker: BrokerSnapshot;
  devices: DeviceSnapshot[];
  entities: EntityConfig[];
  states: Record<string, EntityState>;
  uiConfigs: Record<string, DeviceUiConfig>;
  lights: LightConfig[];
  firmware: FirmwareSnapshot;
}

export interface SnapshotEvent {
  type: 'snapshot' | 'entity' | 'state' | 'availability' | 'broker' | 'ui' | 'firmware';
  snapshot?: Snapshot;
  entity?: EntityConfig;
  entityId?: string;
  state?: EntityState;
  deviceId?: string;
  availability?: AvailabilityState;
  broker?: BrokerSnapshot;
  uiConfig?: DeviceUiConfig;
  nodeId?: string;
  firmware?: FirmwareSnapshot;
}

export interface CommandRequest {
  value?: unknown;
  confirm?: boolean;
}

export interface CommandPublish {
  topic: string;
  payload: string;
  retain: false;
}
