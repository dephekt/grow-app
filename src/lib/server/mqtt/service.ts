import mqtt, { type MqttClient } from 'mqtt';
import { EventEmitter } from 'node:events';
import { buildCommandPublish, normalizeDiscoveryId, parseDiscoveryPayload } from './discovery';
import { getSiteMqttConfig, type SiteMqttConfig } from './config';
import { parseUiConfigPayload } from './ui-metadata';
import {
  buildFirmwareChannelConfig,
  parseFirmwareChannelPayload,
  parseFirmwareDevicePayload
} from '$lib/server/firmware/metadata';
import type {
  AvailabilityState,
  BrokerSnapshot,
  CommandRequest,
  DeviceSnapshot,
  DeviceUiConfig,
  EntityConfig,
  EntityState,
  FirmwareChannel,
  FirmwareChannelConfig,
  FirmwareDeviceConfig,
  FirmwareSnapshot,
  Snapshot,
  SnapshotEvent
} from './types';

type Listener = (event: SnapshotEvent) => void;

export class SiteMqttService {
  private client: MqttClient | null = null;
  private started = false;
  private readonly entities = new Map<string, EntityConfig>();
  private readonly stateByEntity = new Map<string, EntityState>();
  private readonly availabilityByDevice = new Map<string, AvailabilityState>();
  private readonly topicToEntity = new Map<string, Set<string>>();
  private readonly availabilityTopicToEntity = new Map<string, Set<string>>();
  private readonly uiByNodeId = new Map<string, DeviceUiConfig>();
  private readonly firmwareByNodeId = new Map<string, FirmwareDeviceConfig>();
  private readonly firmwareChannelByNodeId = new Map<string, FirmwareChannelConfig>();
  private readonly retainedByTopic = new Map<string, string>();
  private readonly emitter = new EventEmitter();
  private broker: BrokerSnapshot = {
    connected: false,
    connecting: false,
    error: null,
    lastConnectedAt: null,
    lastMessageAt: null
  };

  constructor(private readonly config: SiteMqttConfig) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.broker.connecting = true;

    this.client = mqtt.connect(this.config.mqttUrl, {
      username: this.config.username,
      password: this.config.password,
      clientId: `grow-app-site-${this.config.site}-${process.pid}`,
      clean: true,
      reconnectPeriod: 5000,
      keepalive: 30
    });

    this.client.on('connect', () => {
      this.broker = {
        ...this.broker,
        connected: true,
        connecting: false,
        error: null,
        lastConnectedAt: new Date().toISOString()
      };
      this.client?.subscribe(`${this.config.topicPrefix}/#`, { qos: 0 });
      this.emit({ type: 'broker', broker: this.broker });
    });

    this.client.on('reconnect', () => {
      this.broker = { ...this.broker, connected: false, connecting: true };
      this.emit({ type: 'broker', broker: this.broker });
    });

    this.client.on('close', () => {
      this.broker = { ...this.broker, connected: false, connecting: false };
      this.emit({ type: 'broker', broker: this.broker });
    });

    this.client.on('error', (error) => {
      this.broker = { ...this.broker, error: error.message, connecting: false };
      this.emit({ type: 'broker', broker: this.broker });
    });

    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload.toString());
    });
  }

  snapshot(): Snapshot {
    const entities = [...this.entities.values()].sort((a, b) => a.name.localeCompare(b.name));
    const states = Object.fromEntries([...this.stateByEntity.entries()]);
    const uiConfigs = Object.fromEntries([...this.uiByNodeId.entries()]);
    const firmware = this.firmwareSnapshot();

    return {
      site: this.config.site,
      topicPrefix: this.config.topicPrefix,
      discoveryPrefix: this.config.discoveryPrefix,
      generatedAt: new Date().toISOString(),
      broker: this.broker,
      devices: this.devices(entities),
      entities,
      states,
      uiConfigs,
      firmware
    };
  }

  subscribe(listener: Listener): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  async publishCommand(entityId: string, request: CommandRequest): Promise<void> {
    const entity = this.entities.get(entityId);
    if (!entity) throw new Error('Unknown entity');

    const command = buildCommandPublish(entity, request);

    await new Promise<void>((resolve, reject) => {
      if (!this.client || !this.client.connected) {
        reject(new Error('Broker is not connected'));
        return;
      }

      this.client.publish(command.topic, command.payload, { qos: 0, retain: command.retain }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  firmwareDevice(nodeId: string): FirmwareDeviceConfig | undefined {
    return this.firmwareByNodeId.get(nodeId);
  }

  selectedFirmwareChannel(nodeId: string): FirmwareChannel {
    return this.firmwareChannelByNodeId.get(nodeId)?.channel ?? 'stable';
  }

  firmwareUpdateEntity(nodeId: string): EntityConfig | undefined {
    return this.deviceEntity(nodeId, (entity) => entity.component === 'update' && Boolean(entity.commandTopic));
  }

  firmwareCheckButton(nodeId: string): EntityConfig | undefined {
    return this.deviceEntity(nodeId, (entity) => {
      if (entity.component !== 'button' || !entity.commandTopic) return false;
      const value = `${entity.name} ${entity.objectId ?? ''}`.toLowerCase();
      return value.includes('firmware') && value.includes('check');
    });
  }

  entityState(entityId: string): EntityState {
    return this.stateByEntity.get(entityId) ?? { value: null, updatedAt: null };
  }

  async setFirmwareChannel(nodeId: string, channel: FirmwareChannel): Promise<FirmwareChannelConfig> {
    const config = buildFirmwareChannelConfig(nodeId, channel);
    const topic = `${this.config.topicPrefix}/_app/firmware/${nodeId}/channel`;
    const payload = JSON.stringify(config);
    await this.publishRaw(topic, payload, true);
    this.retainedByTopic.set(topic, payload);
    this.firmwareChannelByNodeId.set(nodeId, config);
    this.emitFirmware();
    return config;
  }

  async triggerFirmwareCheck(nodeId: string): Promise<boolean> {
    const button = this.firmwareCheckButton(nodeId);
    if (!button) return false;
    await this.publishCommand(button.id, { confirm: true });
    return true;
  }

  async applyFirmwareUpdate(nodeId: string): Promise<void> {
    const update = this.firmwareUpdateEntity(nodeId);
    if (!update?.commandTopic) throw new Error('Firmware update entity is not discovered');
    await this.publishRaw(update.commandTopic, 'INSTALL', false);
  }

  private handleMessage(topic: string, payload: string): void {
    this.broker = { ...this.broker, lastMessageAt: new Date().toISOString() };
    this.retainedByTopic.set(topic, payload);

    const discovered = parseDiscoveryPayload(topic, payload, this.config.discoveryPrefix);
    if (discovered) {
      this.upsertEntity(discovered);
      return;
    }

    const uiConfig = parseUiConfigPayload(topic, payload, this.config.topicPrefix);
    if (uiConfig) {
      if (uiConfig.config) this.uiByNodeId.set(uiConfig.nodeId, uiConfig.config);
      else this.uiByNodeId.delete(uiConfig.nodeId);
      this.emit({ type: 'ui', nodeId: uiConfig.nodeId, uiConfig: uiConfig.config ?? undefined });
      this.emit({ type: 'snapshot', snapshot: this.snapshot() });
      return;
    }

    const firmwareDevice = parseFirmwareDevicePayload(topic, payload, this.config.topicPrefix);
    if (firmwareDevice) {
      if (firmwareDevice.config) this.firmwareByNodeId.set(firmwareDevice.nodeId, firmwareDevice.config);
      else this.firmwareByNodeId.delete(firmwareDevice.nodeId);
      this.emitFirmware();
      return;
    }

    const firmwareChannel = parseFirmwareChannelPayload(topic, payload, this.config.topicPrefix);
    if (firmwareChannel) {
      if (firmwareChannel.config) this.firmwareChannelByNodeId.set(firmwareChannel.nodeId, firmwareChannel.config);
      else this.firmwareChannelByNodeId.delete(firmwareChannel.nodeId);
      this.emitFirmware();
      return;
    }

    const stateEntityIds = this.topicToEntity.get(topic);
    if (stateEntityIds) {
      for (const entityId of stateEntityIds) {
        const state = { value: payload, updatedAt: new Date().toISOString() };
        this.stateByEntity.set(entityId, state);
        this.emit({ type: 'state', entityId, state });
      }
    }

    const availabilityEntityIds = this.availabilityTopicToEntity.get(topic);
    if (availabilityEntityIds) {
      for (const entityId of availabilityEntityIds) {
        const entity = this.entities.get(entityId);
        if (!entity) continue;
        const availability = payload === entity.payloadAvailable ? 'online' : payload === entity.payloadNotAvailable ? 'offline' : 'unknown';
        const deviceId = entity.device.identifiers[0];
        this.availabilityByDevice.set(deviceId, availability);
        this.emit({ type: 'availability', deviceId, availability });
      }
    }
  }

  private upsertEntity(discoveredEntity: EntityConfig): void {
    const entity = this.scopedEntity(discoveredEntity);
    const previous = this.entities.get(entity.id);
    if (previous?.stateTopic) this.topicToEntity.get(previous.stateTopic)?.delete(entity.id);
    if (previous?.availabilityTopic) this.availabilityTopicToEntity.get(previous.availabilityTopic)?.delete(entity.id);

    this.entities.set(entity.id, entity);

    if (entity.stateTopic) {
      const current = this.topicToEntity.get(entity.stateTopic) ?? new Set<string>();
      current.add(entity.id);
      this.topicToEntity.set(entity.stateTopic, current);
    }

    if (entity.availabilityTopic) {
      const current = this.availabilityTopicToEntity.get(entity.availabilityTopic) ?? new Set<string>();
      current.add(entity.id);
      this.availabilityTopicToEntity.set(entity.availabilityTopic, current);
    }

    if (!this.availabilityByDevice.has(entity.device.identifiers[0])) {
      this.availabilityByDevice.set(entity.device.identifiers[0], 'unknown');
    }

    if (entity.stateTopic && this.retainedByTopic.has(entity.stateTopic)) {
      this.stateByEntity.set(entity.id, {
        value: this.retainedByTopic.get(entity.stateTopic) ?? null,
        updatedAt: new Date().toISOString()
      });
    }

    if (entity.availabilityTopic && this.retainedByTopic.has(entity.availabilityTopic)) {
      const payload = this.retainedByTopic.get(entity.availabilityTopic);
      const availability =
        payload === entity.payloadAvailable ? 'online' : payload === entity.payloadNotAvailable ? 'offline' : 'unknown';
      this.availabilityByDevice.set(entity.device.identifiers[0], availability);
    }

    this.emit({ type: 'entity', entity });
    this.emit({ type: 'snapshot', snapshot: this.snapshot() });
  }

  private scopedEntity(entity: EntityConfig): EntityConfig {
    const existing = this.entities.get(entity.id);
    if (!existing || this.samePhysicalEntity(existing, entity)) return entity;

    const scope = entity.nodeId ?? entity.device.identifiers[0];
    const scopedId = normalizeDiscoveryId([scope, entity.uniqueId].filter(Boolean).join('_'));
    const scopedExisting = this.entities.get(scopedId);
    if (!scopedExisting || this.samePhysicalEntity(scopedExisting, entity)) {
      return { ...entity, id: scopedId };
    }

    return {
      ...entity,
      id: normalizeDiscoveryId([scope, entity.component, entity.objectId ?? entity.uniqueId].filter(Boolean).join('_'))
    };
  }

  private samePhysicalEntity(left: EntityConfig, right: EntityConfig): boolean {
    const leftNodeId = left.nodeId ?? left.device.identifiers[0];
    const rightNodeId = right.nodeId ?? right.device.identifiers[0];
    if (leftNodeId && rightNodeId && leftNodeId === rightNodeId) return true;
    if (left.stateTopic && right.stateTopic && left.stateTopic === right.stateTopic) return true;
    if (left.commandTopic && right.commandTopic && left.commandTopic === right.commandTopic) return true;
    return left.device.identifiers.some((identifier) => right.device.identifiers.includes(identifier));
  }

  private devices(entities: EntityConfig[]): DeviceSnapshot[] {
    const devices = new Map<string, DeviceSnapshot>();

    for (const entity of entities) {
      const id = entity.device.identifiers[0];
      const nodeId = entity.nodeId ?? id;
      const current = devices.get(id) ?? {
        id,
        nodeId,
        name: entity.device.name,
        manufacturer: entity.device.manufacturer,
        model: entity.device.model,
        swVersion: entity.device.swVersion,
        availability: this.availabilityByDevice.get(id) ?? 'unknown',
        entityIds: []
      };

      current.entityIds.push(entity.id);
      devices.set(id, current);
    }

    return [...devices.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private firmwareSnapshot(): FirmwareSnapshot {
    return {
      devices: Object.fromEntries([...this.firmwareByNodeId.entries()]),
      channels: Object.fromEntries([...this.firmwareChannelByNodeId.entries()])
    };
  }

  private deviceEntity(nodeId: string, predicate: (entity: EntityConfig) => boolean): EntityConfig | undefined {
    for (const entity of this.entities.values()) {
      const entityNodeId = entity.nodeId ?? entity.device.identifiers[0];
      if (entityNodeId !== nodeId && !entity.device.identifiers.includes(nodeId)) continue;
      if (predicate(entity)) return entity;
    }
    return undefined;
  }

  private publishRaw(topic: string, payload: string, retain: boolean): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.client || !this.client.connected) {
        reject(new Error('Broker is not connected'));
        return;
      }

      this.client.publish(topic, payload, { qos: 0, retain }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private emitFirmware(): void {
    const firmware = this.firmwareSnapshot();
    this.emit({ type: 'firmware', firmware });
    this.emit({ type: 'snapshot', snapshot: this.snapshot() });
  }

  private emit(event: SnapshotEvent): void {
    this.emitter.emit('event', event);
  }
}

let singleton: SiteMqttService | null = null;

export function getSiteMqttService(): SiteMqttService {
  if (!singleton) {
    singleton = new SiteMqttService(getSiteMqttConfig());
    singleton.start();
  }
  return singleton;
}
