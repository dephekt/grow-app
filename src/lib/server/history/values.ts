// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * Which MQTT readings the history recorder stores, and how a payload becomes a
 * number. Kept apart from recorder.ts so it is testable — that module runs the
 * recorder on import.
 */
import type { EntityConfig, EntityState } from '$lib/server/mqtt/types';

export function isRecordable(entity: EntityConfig): boolean {
  if (entity.entityCategory === 'diagnostic') return false;
  return entity.component === 'sensor' || entity.component === 'binary_sensor';
}

export function numericValue(entity: EntityConfig, state: EntityState): number | null {
  if (state.value === null) return null;

  // An empty retained payload is a publisher blanking a stale reading, not a zero.
  if (state.value.trim() === '') return null;

  if (entity.component === 'binary_sensor') {
    if (state.value === (entity.payloadOn ?? 'ON')) return 1;
    if (state.value === (entity.payloadOff ?? 'OFF')) return 0;
    const lc = state.value.trim().toLowerCase();
    if (['on', 'true', '1'].includes(lc)) return 1;
    if (['off', 'false', '0'].includes(lc)) return 0;
    return null;
  }

  const n = Number(state.value);
  return Number.isFinite(n) ? n : null;
}
