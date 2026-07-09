import { describe, expect, it } from 'vitest';
import {
  parseTimeParts,
  timeCommandPayload,
  timeStateToClock,
  toTimeInputValue
} from '../../src/lib/time-entity';

describe('parseTimeParts', () => {
  it('parses the ESPHome JSON state blob', () => {
    expect(parseTimeParts('{"hour": 18, "minute": 5, "second": 9}')).toEqual({
      hour: 18,
      minute: 5,
      second: 9
    });
  });

  it('defaults second to 0 when the blob omits it', () => {
    expect(parseTimeParts('{"hour": 6, "minute": 30}')).toEqual({ hour: 6, minute: 30, second: 0 });
  });

  it('parses H:MM clock strings', () => {
    expect(parseTimeParts('6:05')).toEqual({ hour: 6, minute: 5, second: 0 });
  });

  it('parses HH:MM clock strings', () => {
    expect(parseTimeParts('18:00')).toEqual({ hour: 18, minute: 0, second: 0 });
  });

  it('parses HH:MM:SS clock strings', () => {
    expect(parseTimeParts('23:59:59')).toEqual({ hour: 23, minute: 59, second: 59 });
  });

  it('returns null for malformed JSON', () => {
    expect(parseTimeParts('{"hour": 18, "minute":}')).toBeNull();
  });

  it('returns null for non-integer JSON fields', () => {
    expect(parseTimeParts('{"hour": 18.5, "minute": 0, "second": 0}')).toBeNull();
    expect(parseTimeParts('{"hour": "18", "minute": 0, "second": 0}')).toBeNull();
  });

  it('returns null for out-of-range values', () => {
    expect(parseTimeParts('24:00')).toBeNull();
    expect(parseTimeParts('12:99')).toBeNull();
    expect(parseTimeParts('12:00:60')).toBeNull();
    expect(parseTimeParts('{"hour": 24, "minute": 0, "second": 0}')).toBeNull();
    expect(parseTimeParts('{"hour": -1, "minute": 0}')).toBeNull();
  });

  it('returns null for the wrong JSON shape', () => {
    expect(parseTimeParts('[18, 0, 0]')).toBeNull();
    expect(parseTimeParts('42')).toBeNull();
    expect(parseTimeParts('"18:00"')).toBeNull();
    expect(parseTimeParts('{"minute": 0}')).toBeNull();
  });

  it('returns null for empty, null, and undefined', () => {
    expect(parseTimeParts('')).toBeNull();
    expect(parseTimeParts('   ')).toBeNull();
    expect(parseTimeParts(null)).toBeNull();
    expect(parseTimeParts(undefined)).toBeNull();
  });
});

describe('timeStateToClock', () => {
  it('renders zero-padded HH:MM:SS from a blob', () => {
    expect(timeStateToClock('{"hour": 6, "minute": 5, "second": 9}')).toBe('06:05:09');
  });

  it('renders zero-padded HH:MM:SS from a clock string', () => {
    expect(timeStateToClock('6:05')).toBe('06:05:00');
  });

  it('returns null for unparseable input', () => {
    expect(timeStateToClock('nonsense')).toBeNull();
    expect(timeStateToClock(null)).toBeNull();
  });
});

describe('toTimeInputValue', () => {
  it('renders zero-padded HH:MM', () => {
    expect(toTimeInputValue('{"hour": 6, "minute": 5, "second": 9}')).toBe('06:05');
    expect(toTimeInputValue('18:00:00')).toBe('18:00');
  });

  it('returns an empty string for unparseable input', () => {
    expect(toTimeInputValue('nope')).toBe('');
    expect(toTimeInputValue(null)).toBe('');
    expect(toTimeInputValue(undefined)).toBe('');
  });
});

describe('timeCommandPayload', () => {
  it('encodes a clock string to the ESPHome JSON object', () => {
    expect(timeCommandPayload('18:00')).toBe('{"hour":18,"minute":0,"second":0}');
    expect(timeCommandPayload('06:05:09')).toBe('{"hour":6,"minute":5,"second":9}');
  });

  it('throws with a helpful message for a non-string value', () => {
    expect(() => timeCommandPayload(1800)).toThrow(/time value \(HH:MM or HH:MM:SS\)/);
    expect(() => timeCommandPayload(null)).toThrow(/time value/);
    expect(() => timeCommandPayload(undefined)).toThrow(/time value/);
  });

  it('throws for an unparseable string', () => {
    expect(() => timeCommandPayload('24:00')).toThrow(/time value/);
    expect(() => timeCommandPayload('not a time')).toThrow(/time value/);
  });
});
