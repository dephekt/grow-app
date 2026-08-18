// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * One definition of what a JSON value has to look like to be a number, shared by the shot
 * resolver, the zone and schedule parsers, and the run route's audit log. Callers keep the
 * finite-or-integer check they already wrote, since NaN fails both.
 *
 * `optBound` is deliberately not a caller: a blank string is "no bound" there, not an error.
 */
export function numericScalar(value: unknown): number {
  if (typeof value === 'number') return value;
  // Blank strings belong with the rest: Number('') and Number('  ') are 0, and 0 is a legal
  // station sid, so an empty form field would otherwise bind a zone to a real valve.
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}
