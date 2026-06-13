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
  commandTopic?: string;
  availabilityTopic?: string;
  unit?: string;
  deviceClass?: string;
  stateClass?: string;
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
  name: string;
  manufacturer?: string;
  model?: string;
  swVersion?: string;
  availability: AvailabilityState;
  entityIds: string[];
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
  topicPrefix: string;
  discoveryPrefix: string;
  generatedAt: string;
  broker: BrokerSnapshot;
  devices: DeviceSnapshot[];
  entities: EntityConfig[];
  states: Record<string, EntityState>;
}

export interface SnapshotEvent {
  type: 'snapshot' | 'entity' | 'state' | 'availability' | 'broker';
  snapshot?: Snapshot;
  entity?: EntityConfig;
  entityId?: string;
  state?: EntityState;
  deviceId?: string;
  availability?: AvailabilityState;
  broker?: BrokerSnapshot;
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
