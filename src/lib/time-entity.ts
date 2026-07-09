/**
 * Shared codec for ESPHome MQTT `time` entities.
 *
 * ESPHome's `mqtt_time` component (see components/mqtt/mqtt_time.cpp in the
 * ESPHome source) does NOT use a plain clock string on the wire. Instead it
 * publishes state as a JSON object with integer fields and parses the command
 * topic with the same shape:
 *
 *     {"hour": 18, "minute": 0, "second": 0}
 *
 * State is published via `publish_json` (hour/minute/second always present).
 * The command topic is read with `subscribe_json` and expects that same object;
 * a bare string like "18:00:00" fails JSON parsing on-device and is silently
 * dropped.
 *
 * This codec is pure and importable from both server (command encoding in the
 * MQTT discovery layer) and client (rendering a native <input type="time">). It
 * translates between the ESPHome JSON wire format and human clock strings so the
 * UI never shows the raw JSON blob and commands are encoded in the shape the
 * device actually accepts. No browser or Node globals are referenced.
 */

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

/**
 * Decode either the ESPHome JSON state blob (`{"hour":..,"minute":..,"second":..}`,
 * with `second` optional and defaulting to 0) or a plain clock string
 * (`H:MM`, `HH:MM`, or `HH:MM:SS`) into validated {@link TimeParts}.
 *
 * Returns `null` for anything invalid: malformed JSON, out-of-range values
 * (e.g. `24:00`, `12:99`), wrong shape, empty string, null, or undefined.
 */
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

/**
 * Render the wire value as a zero-padded `HH:MM:SS` clock string, or `null` if
 * it cannot be parsed.
 */
export function timeStateToClock(raw: string | null | undefined): string | null {
  const parts = parseTimeParts(raw);
  if (parts === null) return null;
  return `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

/**
 * Render the wire value as a zero-padded `HH:MM` string suitable for the
 * `value` of an `<input type="time">`, or an empty string if unparseable.
 */
export function toTimeInputValue(raw: string | null | undefined): string {
  const parts = parseTimeParts(raw);
  if (parts === null) return '';
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * Encode a clock string (from an `<input type="time">` or similar) into the
 * ESPHome JSON command payload `{"hour":..,"minute":..,"second":..}`.
 *
 * Throws when `value` is not a parseable time string.
 */
export function timeCommandPayload(value: unknown): string {
  const parts = typeof value === 'string' ? parseTimeParts(value) : null;
  if (parts === null) {
    throw new Error('Expected a time value (HH:MM or HH:MM:SS)');
  }
  return JSON.stringify({ hour: parts.hour, minute: parts.minute, second: parts.second });
}
