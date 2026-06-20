import type { CommandPublish, CommandRequest, DiscoveryDevice, EntityConfig } from './types';

const DANGEROUS_WORDS = [
  'restart',
  'reboot',
  'calibration',
  'calibrate',
  'clear calibration',
  'factory reset',
  'reset factory',
  'reset'
];

const topicKeys = {
  stateTopic: ['state_topic', 'stat_t'],
  commandTopic: ['command_topic', 'cmd_t'],
  availabilityTopic: ['availability_topic', 'avty_t'],
  unit: ['unit_of_measurement', 'unit_of_meas'],
  deviceClass: ['device_class', 'dev_cla'],
  stateClass: ['state_class', 'stat_cla'],
  suggestedDisplayPrecision: ['suggested_display_precision', 'sug_dsp_prc'],
  entityCategory: ['entity_category', 'ent_cat'],
  icon: ['icon', 'ic'],
  uniqueId: ['unique_id', 'uniq_id'],
  objectId: ['object_id', 'obj_id'],
  payloadOn: ['payload_on', 'pl_on'],
  payloadOff: ['payload_off', 'pl_off'],
  payloadPress: ['payload_press', 'pl_prs'],
  payloadAvailable: ['payload_available', 'pl_avail'],
  payloadNotAvailable: ['payload_not_available', 'pl_not_avail']
} as const;

export interface DiscoveryTopicParts {
  component: string;
  nodeId?: string;
  objectId: string;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function getString(payload: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = text(payload[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function getNumber(payload: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = numberValue(payload[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function resolveTopic(topic: string | undefined, baseTopic: string | undefined): string | undefined {
  if (!topic) return undefined;
  if (baseTopic && topic.includes('~')) return topic.replaceAll('~', baseTopic);
  return topic;
}

function normalizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseDevice(payload: Record<string, unknown>, fallbackName: string): DiscoveryDevice {
  const rawDevice = payload.device ?? payload.dev;
  const device = rawDevice && typeof rawDevice === 'object' ? (rawDevice as Record<string, unknown>) : {};
  const ids = device.identifiers ?? device.ids;
  const identifiers = Array.isArray(ids)
    ? ids.map(String)
    : typeof ids === 'string'
      ? [ids]
      : [normalizeId(fallbackName)];

  return {
    identifiers,
    name: text(device.name) ?? text(device.name_by_user) ?? fallbackName,
    manufacturer: text(device.manufacturer) ?? text(device.mf),
    model: text(device.model) ?? text(device.mdl),
    swVersion: text(device.sw_version) ?? text(device.sw)
  };
}

function parseOptions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(String).filter((option) => option.length > 0);
}

export function parseDiscoveryTopic(topic: string, discoveryPrefix: string): DiscoveryTopicParts | null {
  if (!topic.startsWith(`${discoveryPrefix}/`) || !topic.endsWith('/config')) return null;
  const relative = topic.slice(discoveryPrefix.length + 1, -'/config'.length);
  const parts = relative.split('/').filter(Boolean);

  if (parts.length < 2) return null;
  if (parts.length === 2) {
    return { component: parts[0], objectId: parts[1] };
  }

  return {
    component: parts[0],
    nodeId: parts.slice(1, -1).join('/'),
    objectId: parts.at(-1) ?? parts[1]
  };
}

export function parseDiscoveryPayload(
  topic: string,
  payloadText: string,
  discoveryPrefix: string
): EntityConfig | null {
  const topicParts = parseDiscoveryTopic(topic, discoveryPrefix);
  if (!topicParts || payloadText.trim().length === 0) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadText) as Record<string, unknown>;
  } catch {
    return null;
  }

  const baseTopic = text(payload['~']);
  const rawName = text(payload.name) ?? topicParts.objectId;
  const name = rawName === 'null' ? topicParts.objectId : rawName;
  const uniqueId =
    getString(payload, topicKeys.uniqueId) ??
    normalizeId([topicParts.component, topicParts.nodeId, topicParts.objectId].filter(Boolean).join('_'));
  const objectId = getString(payload, topicKeys.objectId) ?? topicParts.objectId;
  const stateTopic = resolveTopic(getString(payload, topicKeys.stateTopic), baseTopic);
  const commandTopic = resolveTopic(getString(payload, topicKeys.commandTopic), baseTopic);
  const availabilityTopic = resolveTopic(getString(payload, topicKeys.availabilityTopic), baseTopic);
  const payloadAvailable = getString(payload, topicKeys.payloadAvailable) ?? 'online';
  const payloadNotAvailable = getString(payload, topicKeys.payloadNotAvailable) ?? 'offline';
  const device = parseDevice(payload, topicParts.nodeId ?? objectId);
  const dangerous = isDangerousEntity(topicParts.component, name, objectId);

  return {
    id: normalizeId(uniqueId),
    component: topicParts.component,
    name,
    uniqueId,
    objectId,
    nodeId: topicParts.nodeId,
    device,
    stateTopic,
    commandTopic,
    availabilityTopic,
    unit: getString(payload, topicKeys.unit),
    deviceClass: getString(payload, topicKeys.deviceClass),
    stateClass: getString(payload, topicKeys.stateClass),
    suggestedDisplayPrecision: getNumber(payload, topicKeys.suggestedDisplayPrecision),
    entityCategory: getString(payload, topicKeys.entityCategory),
    icon: getString(payload, topicKeys.icon),
    payloadOn: getString(payload, topicKeys.payloadOn) ?? 'ON',
    payloadOff: getString(payload, topicKeys.payloadOff) ?? 'OFF',
    payloadPress: getString(payload, topicKeys.payloadPress) ?? 'PRESS',
    payloadAvailable,
    payloadNotAvailable,
    min: numberValue(payload.min),
    max: numberValue(payload.max),
    step: numberValue(payload.step),
    options: parseOptions(payload.options) ?? parseOptions(payload.ops),
    dangerous,
    writable: Boolean(commandTopic),
    raw: payload
  };
}

export function isDangerousEntity(component: string, name: string, objectId?: string): boolean {
  if (component === 'button') return true;
  const haystack = `${name} ${objectId ?? ''}`.toLowerCase();
  return DANGEROUS_WORDS.some((word) => haystack.includes(word));
}

export function buildCommandPublish(entity: EntityConfig, request: CommandRequest): CommandPublish {
  if (!entity.commandTopic) {
    throw new Error('Entity is not writable');
  }
  if (entity.dangerous && request.confirm !== true) {
    throw new Error('Confirmation required for this command');
  }

  const payload = commandPayload(entity, request.value);

  return {
    topic: entity.commandTopic,
    payload,
    retain: false
  };
}

function commandPayload(entity: EntityConfig, value: unknown): string {
  switch (entity.component) {
    case 'switch':
    case 'light':
    case 'fan': {
      if (typeof value !== 'boolean' && value !== entity.payloadOn && value !== entity.payloadOff) {
        throw new Error('Expected a boolean on/off value');
      }
      return value === true || value === entity.payloadOn ? (entity.payloadOn ?? 'ON') : (entity.payloadOff ?? 'OFF');
    }
    case 'button':
      return entity.payloadPress ?? 'PRESS';
    case 'number': {
      const parsed = numberValue(value);
      if (parsed === undefined) throw new Error('Expected a numeric value');
      if (entity.min !== undefined && parsed < entity.min) throw new Error(`Value must be >= ${entity.min}`);
      if (entity.max !== undefined && parsed > entity.max) throw new Error(`Value must be <= ${entity.max}`);
      return String(parsed);
    }
    case 'select': {
      const selected = String(value ?? '');
      if (entity.options && !entity.options.includes(selected)) {
        throw new Error('Value is not one of the discovered options');
      }
      return selected;
    }
    default:
      if (value === undefined || value === null) throw new Error('Expected a command value');
      return String(value);
  }
}
