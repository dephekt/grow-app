// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { ProcessedSpectrum } from '$lib/spectrum/calibration';

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

/** v2 is v1 with every key shortened; the parsed shape is identical, so only the
 *  wire encoding differs. See `ui-metadata.ts` for why. */
export type DeviceUiSchema = 'grow-ui.v1' | 'grow-ui.v2';

export interface DeviceUiConfig {
  schema: DeviceUiSchema;
  nodeId: string;
  groups: DeviceUiGroup[];
  entities: DeviceUiEntity[];
}

/**
 * A resolved light role: one entity on one node, merged from the per-device
 * `grow-lights.v1` fragments a logical light is assembled from.
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

/** A single device's raw contribution, published to `<node>/_lights/config`; role values are
 *  objectIds LOCAL to `nodeId`. */
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

/** Latest spectrometer frame, kept OUT of Snapshot like the MLX90640 camera payload — delivered
 *  via a dedicated `spectrum` event + /api/spectrum/live. */
export interface LiveSpectrum {
  nodeId: string;
  seq: number;
  integrationUs: number;
  saturated: boolean;
  adcBits: number;
  fw: string | null;
  capturedAt: string;
  counts: number[];
  processed: ProcessedSpectrum;
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
  /** Node ids that have published a spectrometer frame; always set at runtime, optional in the
   *  type only so plain-object fixtures can omit it. */
  spectrometerNodeIds?: string[];
}

export interface SnapshotEvent {
  type: 'snapshot' | 'entity' | 'state' | 'availability' | 'broker' | 'ui' | 'firmware' | 'spectrum';
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
  spectrum?: LiveSpectrum | null;
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
