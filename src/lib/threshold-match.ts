// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { EntityConfig } from '$lib/server/mqtt/types';

/** Recognisers for threshold and alert entities, which carry no deviceClass and so must be
 *  matched on objectId/name. */

function objectIdOf(entity: EntityConfig): string {
  return (entity.objectId ?? entity.id).toLowerCase();
}

/** The metric a threshold/alert belongs to: `co2_high_threshold` → `co2`. */
export function metricPrefix(entity: EntityConfig): string {
  return objectIdOf(entity)
    .replace(/_?(high|low|min|max)_?(threshold|alert|limit)?$/, '')
    .replace(/_?(threshold|alert|limit)$/, '')
    .replace(/_$/, '');
}

/** Which side of the band an entity controls, or null for a combined alert. */
export function entitySide(entity: EntityConfig): 'high' | 'low' | null {
  const objectId = objectIdOf(entity);
  const name = (entity.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const value = `${objectId}_${name}`;

  if (/(^|_)(high|max)(_|$)/.test(value)) return 'high';
  if (/(^|_)(low|min)(_|$)/.test(value)) return 'low';
  return null;
}

/** A writable threshold `number` (e.g. `co2_high_threshold`, `temperature_low_limit`). */
export function isThresholdEntity(entity: EntityConfig): boolean {
  if (entity.component !== 'number') return false;
  const objectId = objectIdOf(entity);
  return objectId.includes('threshold') || /(^|_)(high|low|min|max|limit)(_|$)/.test(objectId);
}

/** An alert `binary_sensor`: a split-side `*_alert`, or a single-band alarm carrying neither
 *  an `alert` token nor a side. */
export function isAlertEntity(entity: EntityConfig): boolean {
  if (entity.component !== 'binary_sensor') return false;
  const objectId = objectIdOf(entity);
  const name = (entity.name ?? '').toLowerCase();
  return (
    objectId.includes('alert') ||
    name.includes('alert') ||
    objectId.includes('alarm') ||
    name.includes('alarm') ||
    entity.deviceClass === 'problem'
  );
}

/** The buzzer-enable `switch` that mutes a device alarm (e.g. `thermal_buzzer_enabled`). */
export function isBuzzerSwitch(entity: EntityConfig): boolean {
  return entity.component === 'switch' && objectIdOf(entity).includes('buzzer');
}

/** The momentary `button` that sounds an alarm self-test (e.g. `thermal_alarm_test`). */
export function isAlarmTestButton(entity: EntityConfig): boolean {
  const objectId = objectIdOf(entity);
  return entity.component === 'button' && objectId.includes('alarm') && objectId.includes('test');
}
