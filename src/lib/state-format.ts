import type { EntityConfig, EntityState } from '$lib/server/mqtt/types';
import { toTimeInputValue } from '$lib/time-entity';

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

  const value = formattedNumericValue(state.value, entity.suggestedDisplayPrecision);
  return entity.unit ? `${value} ${entity.unit}` : value;
}
