// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { EntityConfig, EntityState } from '$lib/server/mqtt/types';
import { toTimeInputValue } from '$lib/time-entity';

// ESPHome publishes these literals when a numeric sensor cannot produce a reading — an unplugged
// probe, a bus error, a divide-by-zero in a template. The payload is retained, so it outlives the
// condition and is indistinguishable from a real value until parsed.
const NO_READING_MARKERS = new Set(['nan', 'inf', '+inf', '-inf', 'infinity', '+infinity', '-infinity']);

function formattedNumericValue(value: string, precision: number | undefined): string {
  if (precision === undefined) return value;

  const decimals = Math.trunc(precision);
  if (decimals < 0 || decimals > 20) return value;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;

  return parsed.toFixed(decimals);
}

export function formatEntityState(entity: EntityConfig, state: EntityState): string {
  if (state.value === null || state.value === undefined || state.value === '') return 'No state yet';

  // Time entities display at minute granularity (HH:MM), matching the
  // <input type="time"> editor — seconds are meaningless for the photoperiod
  // schedule. An unparseable payload reads as "No state yet" rather than falling
  // through and re-rendering the raw JSON blob this codec exists to hide.
  if (entity.component === 'time') {
    const display = toTimeInputValue(state.value);
    return display === '' ? 'No state yet' : display;
  }

  // Checked before the numeric path because formattedNumericValue passes an unparseable value
  // through verbatim, which then collects the unit and renders as "nan lx".
  if (NO_READING_MARKERS.has(state.value.trim().toLowerCase())) return '—';

  const value = formattedNumericValue(state.value, entity.suggestedDisplayPrecision);
  return entity.unit ? `${value} ${entity.unit}` : value;
}
