import type { EntityConfig, EntityState } from '$lib/server/mqtt/types';

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

  const value = formattedNumericValue(state.value, entity.suggestedDisplayPrecision);
  return entity.unit ? `${value} ${entity.unit}` : value;
}
