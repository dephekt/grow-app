// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { DeviceUiConfig, DeviceUiEntity, DeviceUiGroup, DeviceUiSchema } from './types';
import { numberValue, stringValue } from './coerce';

export interface ParsedUiConfig {
  nodeId: string;
  config: DeviceUiConfig | null;
}

/**
 * grow-ui.v2 shortens every key and omits defaulted values. It exists because
 * AsyncMqttClient drops any publish whose packet exceeds the ESP8266 TCP send
 * buffer (2 x TCP_MSS = 2920 B) -- silently, so an oversized payload just makes
 * the device vanish from the dashboard while looking healthy. v1 spent ~40
 * bytes per entity repeating key names, which put the plugs a couple of
 * entities away from that ceiling.
 *
 * Both schemas parse to the same shape, and v1 stays supported indefinitely:
 * devices convert as they are reflashed, and the ESP32 nodes have no ceiling to
 * clear so they have no reason to convert at all.
 */
const V2_GROUP_KEYS: Record<string, string> = {
  i: 'id',
  t: 'title',
  n: 'order',
  v: 'variant',
  s: 'surface',
  d: 'deviceSettingsSection',
  p: 'defaultOpen'
};

const V2_ENTITY_KEYS: Record<string, string> = {
  c: 'component',
  o: 'objectId',
  g: 'group',
  n: 'order',
  r: 'role',
  l: 'label'
};

function expandShortKeys(value: unknown, keys: Record<string, string>): unknown {
  if (!value || typeof value !== 'object') return value;
  const raw = value as Record<string, unknown>;
  const expanded: Record<string, unknown> = {};
  for (const [short, long] of Object.entries(keys)) {
    if (short in raw) expanded[long] = raw[short];
  }
  return expanded;
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

  const schema = raw.schema;
  if (schema !== 'grow-ui.v1' && schema !== 'grow-ui.v2') return null;
  const payloadNodeId = stringValue(raw.nodeId);
  if (payloadNodeId !== nodeId) return null;

  const compact = schema === 'grow-ui.v2';
  const expandGroup = (value: unknown) => (compact ? expandShortKeys(value, V2_GROUP_KEYS) : value);
  const expandEntity = (value: unknown) => (compact ? expandShortKeys(value, V2_ENTITY_KEYS) : value);

  const groups = Array.isArray(raw.groups)
    ? raw.groups.map((group) => parseGroup(expandGroup(group))).filter((group): group is DeviceUiGroup => Boolean(group))
    : [];
  const entities = Array.isArray(raw.entities)
    ? raw.entities.map((entity) => parseEntity(expandEntity(entity))).filter((entity): entity is DeviceUiEntity => Boolean(entity))
    : [];

  return {
    nodeId,
    config: {
      schema: schema as DeviceUiSchema,
      nodeId,
      groups,
      entities
    }
  };
}
