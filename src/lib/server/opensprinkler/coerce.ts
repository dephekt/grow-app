// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * The one place the irrigation API decides what a JSON value has to look like to be a number.
 *
 * Every caller already gates on `Number.isFinite`, so returning NaN for the values that are not
 * numbers hardens each of them without changing the check it already writes.
 */
export function numericScalar(value: unknown): number {
  if (typeof value === 'number') return value;
  // Blank strings belong with the rest: Number('') and Number('  ') are 0, and 0 is a legal
  // station sid, so an empty form field would otherwise bind a zone to a real valve.
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}
