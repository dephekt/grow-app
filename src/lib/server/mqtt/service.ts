import mqtt, { type MqttClient } from 'mqtt';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { buildCommandPublish, normalizeDiscoveryId, parseDiscoveryPayload } from './discovery';
import { getSiteMqttConfig, type SiteMqttConfig } from './config';
import { matchStationTopic, normalizeStationState, stationStateTopic } from '$lib/server/opensprinkler/normalize';
import { parseUiConfigPayload } from './ui-metadata';
import { parseSpectrumPayload, type RawSpectrumFrame } from './spectrum-metadata';
import { processSpectrum } from '$lib/spectrum/calibration';
import { parseLightsConfigPayload } from './light-metadata';
import { resolveSiteTimeZone } from '$lib/server/settings/site-timezone';
import { findQuantumPpfdEntity } from '$lib/entity-match';
import {
  buildFirmwareChannelConfig,
  parseFirmwareChannelPayload,
  parseFirmwareDevicePayload
} from '$lib/server/firmware/metadata';
import type {
  AvailabilityState,
  BrokerSnapshot,
  CommandRequest,
  DeviceLightsFragment,
  DeviceSnapshot,
  DeviceUiConfig,
  EntityConfig,
  EntityState,
  FirmwareChannel,
  FirmwareChannelConfig,
  FirmwareDeviceConfig,
  FirmwareSnapshot,
  LightConfig,
  LightRoleRef,
  LiveSpectrum,
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
  private readonly lightsByNodeId = new Map<string, DeviceLightsFragment>();
  private readonly firmwareByNodeId = new Map<string, FirmwareDeviceConfig>();
  private readonly firmwareChannelByNodeId = new Map<string, FirmwareChannelConfig>();
  private readonly retainedByTopic = new Map<string, string>();
  private readonly emitter = new EventEmitter();
  private readonly cameraFrames = new Map<string, { bytes: Uint8Array; contentType: string; fetchedAt: number }>();
  private readonly cameraFetches = new Map<string, Promise<{ bytes: Uint8Array; contentType: string } | null>>();
  private readonly latestSpectrumByNode = new Map<string, LiveSpectrum>();
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
      clientId: this.config.clientId ?? `grow-app-site-${this.config.site}-${process.pid}-${randomBytes(3).toString('hex')}`,
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
      timezone: resolveSiteTimeZone().zone,
      topicPrefix: this.config.topicPrefix,
      discoveryPrefix: this.config.discoveryPrefix,
      generatedAt: new Date().toISOString(),
      broker: this.broker,
      devices: this.devices(entities),
      entities,
      states,
      uiConfigs,
      lights: this.mergedLights(),
      firmware,
      spectrometerNodeIds: this.spectrometerNodeIds()
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

  /** Publish a raw OpenSprinkler command string to `<osBaseTopic>/cmd`. */
  publishOsCommand(command: string): Promise<void> {
    if (!this.config.osBaseTopic) {
      return Promise.reject(new Error('OpenSprinkler base topic not configured'));
    }
    return this.publishRaw(`${this.config.osBaseTopic}/cmd`, command, false);
  }

  /** Publish (retained) a self-generated discovery config for an OpenSprinkler entity. */
  publishOsDiscovery(topic: string, payload: string): Promise<void> {
    return this.publishRaw(topic, payload, true);
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

  /** Every discovered, writable ESPHome `time.timezone` text entity (component `text`,
   *  objectId `time_zone`, with a command topic). The tz reconciler stamps the derived
   *  site POSIX onto exactly these; a node that publishes no such entity is ignored. */
  timeZoneEntities(): EntityConfig[] {
    return [...this.entities.values()].filter(
      (entity) => entity.component === 'text' && entity.objectId === 'time_zone' && Boolean(entity.commandTopic)
    );
  }

  /** Push a full snapshot to subscribers. The tz reconciler and the timezone PUT use
   *  this to fan a fresh snapshot to connected clients after a state change that isn't
   *  itself carried by an MQTT message (e.g. a persisted-setting refresh). */
  emitClientSnapshot(): void {
    this.emit({ type: 'snapshot', snapshot: this.snapshot() });
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

  private resolveCameraUrl(entity: EntityConfig): string | undefined {
    if (entity.imageUrl) return entity.imageUrl;
    if (entity.imagePath) {
      const nodeId = entity.nodeId ?? entity.device.identifiers[0];
      const sibling = this.deviceEntity(nodeId, (e) => e.objectId === 'ip_address');
      if (!sibling) return undefined;
      const ip = this.entityState(sibling.id).value;
      if (!ip) return undefined;
      return `http://${ip}${entity.imagePath}`;
    }
    return undefined;
  }

  async getCameraFrame(entityId: string, maxAgeMs = 1500): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    const entity = this.entities.get(entityId);
    if (!entity || entity.component !== 'camera') return null;

    const cached = this.cameraFrames.get(entityId);
    if (cached && Date.now() - cached.fetchedAt < maxAgeMs) {
      return { bytes: cached.bytes, contentType: cached.contentType };
    }

    const existing = this.cameraFetches.get(entityId);
    if (existing) return await existing;

    const doFetch = async (): Promise<{ bytes: Uint8Array; contentType: string }> => {
      const url = this.resolveCameraUrl(entity);
      if (!url) throw new Error('camera url unresolved');
      const res = await fetch(url);
      if (!res.ok) throw new Error(`camera fetch ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      return { bytes, contentType };
    };

    const promise = (async () => {
      try {
        let frame: { bytes: Uint8Array; contentType: string };
        try {
          frame = await doFetch();
        } catch {
          frame = await doFetch();
        }
        this.cameraFrames.set(entityId, { ...frame, fetchedAt: Date.now() });
        return frame;
      } catch (error) {
        const stale = this.cameraFrames.get(entityId);
        if (stale) return { bytes: stale.bytes, contentType: stale.contentType };
        const url = this.resolveCameraUrl(entity);
        if (!url) return null;
        throw error;
      } finally {
        this.cameraFetches.delete(entityId);
      }
    })();

    this.cameraFetches.set(entityId, promise);
    return await promise;
  }

  private ingestSpectrum(nodeId: string, frame: RawSpectrumFrame | null): void {
    if (!frame) {
      this.latestSpectrumByNode.delete(nodeId);
      this.emit({ type: 'spectrum', nodeId, spectrum: null });
      return;
    }
    const processed = processSpectrum(frame.counts, {
      integrationUs: frame.integrationUs,
      saturated: frame.saturated,
      adcFullScale: (1 << frame.adcBits) - 1
    });
    const live: LiveSpectrum = {
      nodeId,
      seq: frame.seq,
      integrationUs: frame.integrationUs,
      saturated: frame.saturated,
      adcBits: frame.adcBits,
      fw: frame.fw,
      capturedAt: new Date().toISOString(),
      counts: frame.counts,
      processed
    };
    this.latestSpectrumByNode.set(nodeId, live);
    this.emit({ type: 'spectrum', nodeId, spectrum: live });
  }

  /** Latest processed spectrum for `nodeId`, or the single spectrometer when omitted. */
  latestSpectrum(nodeId?: string): LiveSpectrum | null {
    if (nodeId) return this.latestSpectrumByNode.get(nodeId) ?? null;
    const first = this.latestSpectrumByNode.values().next();
    return first.done ? null : first.value;
  }

  /** Latest ambient illuminance (lux) from the fleet's DLight/BH1750-class sensor — used to
   *  anchor PPFD from lux. Matches on device_class 'illuminance' (or unit 'lx'); null if none. */
  latestIlluminance(): { lux: number; entityId: string; updatedAt: string | null } | null {
    for (const entity of this.entities.values()) {
      if (entity.deviceClass !== 'illuminance' && entity.unit !== 'lx') continue;
      const state = this.stateByEntity.get(entity.id);
      const lux = Number(state?.value);
      if (state?.value != null && Number.isFinite(lux)) {
        return { lux, entityId: entity.id, updatedAt: state.updatedAt };
      }
    }
    return null;
  }

  /** Latest quantum-sensor PPFD (µmol·m⁻²·s⁻¹) from the Apogee SQ-521 — the live canopy
   *  measurement, and the authoritative reading a reference anchor captures. Matches
   *  isQuantumPpfd (objectId 'ppfd'); null if the sensor hasn't reported. Mirrors
   *  latestIlluminance() so the anchor server never trusts a client-sent µmol value. */
  latestQuantumPpfd(): { ppfd: number; entityId: string; updatedAt: string | null } | null {
    // Same resolver the client uses, so the live display and this anchor bind to the same sensor.
    const entity = findQuantumPpfdEntity(this.entities.values());
    if (!entity) return null;
    // Skip an offline publisher: its retained PPFD scalar lingers on the broker and must not be
    // anchored as a live reading (the LWT flips availability, but the state topic stays retained).
    if (this.availabilityByDevice.get(entity.device.identifiers[0]) === 'offline') return null;
    const state = this.stateByEntity.get(entity.id);
    const raw = state?.value;
    if (raw == null || raw.trim() === '') return null; // '' → Number('') === 0 would anchor a live 0
    const ppfd = Number(raw);
    if (!Number.isFinite(ppfd)) return null;
    return { ppfd, entityId: entity.id, updatedAt: state?.updatedAt ?? null };
  }

  spectrometerNodeIds(): string[] {
    return [...this.latestSpectrumByNode.keys()];
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

    const lightsConfig = parseLightsConfigPayload(topic, payload, this.config.topicPrefix);
    if (lightsConfig) {
      if (lightsConfig.fragment) this.lightsByNodeId.set(lightsConfig.nodeId, lightsConfig.fragment);
      else this.lightsByNodeId.delete(lightsConfig.nodeId);
      // No dedicated event — logical lights are derived state re-computed in
      // snapshot(); a full snapshot carries the merged result to the client.
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

    // Bulk spectrometer frame: kept out of the scalar state map (camera precedent),
    // processed once here, and delivered via a dedicated `spectrum` event.
    const spectrum = parseSpectrumPayload(topic, payload, this.config.topicPrefix);
    if (spectrum) {
      this.ingestSpectrum(spectrum.nodeId, spectrum.frame);
      return;
    }

    // OpenSprinkler status normalization: OS publishes station state as JSON to
    // `<base>/station/<n>`; republish a plain ON/OFF scalar (retained) to
    // `<base>/station/<n>/state` so the self-published discovery entity + the
    // recorder see clean values (the discovery parser has no value_template).
    if (this.config.osEnabled && this.config.osBaseTopic) {
      const sid = matchStationTopic(topic, this.config.osBaseTopic);
      if (sid !== null) {
        const scalar = normalizeStationState(payload);
        if (scalar) {
          void this.publishRaw(stationStateTopic(this.config.osBaseTopic, sid), scalar, true).catch(() => {});
        }
        return;
      }
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

  /** Merge every device's `grow-lights.v1` fragment into logical lights, keyed by
   *  light id. Each role's objectId is local to the publishing node, so we stamp it
   *  with that node here; the plug fragment supplies name/type (the anchor). */
  private mergedLights(): LightConfig[] {
    const byId = new Map<string, LightConfig>();

    // Data-driven setter for each scalar role: maps a role name to the typed
    // LightRoles field it populates.
    const scalarRoles: Record<string, (roles: LightConfig['roles'], ref: LightRoleRef) => void> = {
      power: (roles, ref) => (roles.power = ref),
      scheduleArm: (roles, ref) => (roles.scheduleArm = ref),
      onTime: (roles, ref) => (roles.onTime = ref),
      offTime: (roles, ref) => (roles.offTime = ref),
      dimmer: (roles, ref) => (roles.dimmer = ref)
    };

    // Merge in a deterministic order so the result doesn't depend on the arrival
    // order of retained fragment messages.
    const fragments = [...this.lightsByNodeId.values()].sort((a, b) => a.nodeId.localeCompare(b.nodeId));

    for (const fragment of fragments) {
      for (const entry of fragment.lights) {
        const light = byId.get(entry.id) ?? { id: entry.id, name: entry.id, order: 0, roles: {} };
        // Identity comes from the anchor entry (the one carrying a name): take
        // name/type/order together, honoring an explicit order 0.
        if (entry.name) {
          light.name = entry.name;
          light.type = entry.type;
          light.order = entry.order ?? 0;
        }

        for (const [role, value] of Object.entries(entry.roles)) {
          if (role === 'metrics') {
            const ids = Array.isArray(value) ? value : [value];
            light.roles.metrics = [
              ...(light.roles.metrics ?? []),
              ...ids.map((objectId) => ({ node: fragment.nodeId, objectId }))
            ];
            continue;
          }
          if (typeof value !== 'string') continue;
          const setRole = scalarRoles[role];
          if (setRole) setRole(light.roles, { node: fragment.nodeId, objectId: value });
        }

        byId.set(entry.id, light);
      }
    }

    return [...byId.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
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
