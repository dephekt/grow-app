// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/** Codec for ESPHome `time` entities, which carry `{"hour":..,"minute":..,"second":..}` on the
 *  wire — a bare "18:00:00" is silently dropped on-device. */

export interface TimeParts {
  hour: number;
  minute: number;
  second: number;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function inRange(value: number, max: number): boolean {
  return value >= 0 && value <= max;
}

function partsFromNumbers(hour: unknown, minute: unknown, second: unknown): TimeParts | null {
  if (!isInteger(hour) || !isInteger(minute) || !isInteger(second)) return null;
  if (!inRange(hour, 23) || !inRange(minute, 59) || !inRange(second, 59)) return null;
  return { hour, minute, second };
}

function parseClockString(raw: string): TimeParts | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  return partsFromNumbers(hour, minute, second);
}

function parseJsonBlob(raw: string): TimeParts | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return null;
  }
  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
  const record = decoded as Record<string, unknown>;
  const second = record.second === undefined ? 0 : record.second;
  return partsFromNumbers(record.hour, record.minute, second);
}

/** Decode the ESPHome JSON blob or a plain clock string, returning null for anything invalid. */
export function parseTimeParts(raw: string | null | undefined): TimeParts | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return parseJsonBlob(trimmed);
  return parseClockString(trimmed);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Render the wire value as `HH:MM` for an `<input type="time">`, or empty if unparseable. */
export function toTimeInputValue(raw: string | null | undefined): string {
  const parts = parseTimeParts(raw);
  if (parts === null) return '';
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** Encode a clock string into the ESPHome JSON command payload; throws if unparseable. */
export function timeCommandPayload(value: unknown): string {
  const parts = typeof value === 'string' ? parseTimeParts(value) : null;
  if (parts === null) {
    throw new Error('Expected a time value (HH:MM or HH:MM:SS)');
  }
  return JSON.stringify({ hour: parts.hour, minute: parts.minute, second: parts.second });
}
