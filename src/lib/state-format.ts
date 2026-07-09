import type { EntityConfig, EntityState } from '$lib/server/mqtt/types';
import { timeStateToClock } from '$lib/time-entity';

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

  if (entity.component === 'time') {
    const clock = timeStateToClock(state.value);
    if (clock !== null) return clock;
  }

  const value = formattedNumericValue(state.value, entity.suggestedDisplayPrecision);
  return entity.unit ? `${value} ${entity.unit}` : value;
}
