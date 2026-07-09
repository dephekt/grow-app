import type { DeviceUiConfig, DeviceUiEntity, DeviceUiGroup } from './types';
import { numberValue, stringValue } from './coerce';

export interface ParsedUiConfig {
  nodeId: string;
  config: DeviceUiConfig | null;
}

function parseGroup(value: unknown): DeviceUiGroup | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = stringValue(raw.id);
  const title = stringValue(raw.title);
  if (!id || !title) return null;

  return {
    id,
    title,
    order: numberValue(raw.order, 0),
    variant: stringValue(raw.variant),
    surface: stringValue(raw.surface),
    deviceSettingsSection: stringValue(raw.deviceSettingsSection),
    defaultOpen: typeof raw.defaultOpen === 'boolean' ? raw.defaultOpen : false
  };
}

function parseEntity(value: unknown): DeviceUiEntity | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const component = stringValue(raw.component);
  const objectId = stringValue(raw.objectId);
  const group = stringValue(raw.group);
  if (!component || !objectId || !group) return null;

  return {
    component,
    objectId,
    group,
    role: stringValue(raw.role),
    order: numberValue(raw.order, 0),
    label: stringValue(raw.label)
  };
}

export function parseUiConfigTopic(topic: string, topicPrefix: string): string | null {
  if (!topic.startsWith(`${topicPrefix}/`) || !topic.endsWith('/_ui/config')) return null;
  const nodeId = topic.slice(topicPrefix.length + 1, -'/_ui/config'.length);
  return nodeId.length > 0 && !nodeId.includes('/') ? nodeId : null;
}

export function parseUiConfigPayload(topic: string, payloadText: string, topicPrefix: string): ParsedUiConfig | null {
  const nodeId = parseUiConfigTopic(topic, topicPrefix);
  if (!nodeId) return null;
  if (payloadText.trim().length === 0) return { nodeId, config: null };

  let payload: unknown;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return null;
  }

  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;

  if (raw.schema !== 'grow-ui.v1') return null;
  const payloadNodeId = stringValue(raw.nodeId);
  if (payloadNodeId !== nodeId) return null;

  const groups = Array.isArray(raw.groups) ? raw.groups.map(parseGroup).filter((group): group is DeviceUiGroup => Boolean(group)) : [];
  const entities = Array.isArray(raw.entities)
    ? raw.entities.map(parseEntity).filter((entity): entity is DeviceUiEntity => Boolean(entity))
    : [];

  return {
    nodeId,
    config: {
      schema: 'grow-ui.v1',
      nodeId,
      groups,
      entities
    }
  };
}
