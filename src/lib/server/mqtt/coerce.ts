/** Coerce an unknown JSON value to a non-empty string, or undefined. */
export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Coerce an unknown JSON value to a finite number, falling back otherwise. */
export function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
