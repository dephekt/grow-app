// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import { isRecordable, numericValue } from '../../src/lib/server/history/values';
import type { EntityComponent, EntityConfig, EntityState } from '../../src/lib/server/mqtt/types';

function entity(patch: Partial<EntityConfig> & { component: EntityComponent }): EntityConfig {
  return {
    id: 'substrate-a.substrate_raw_counts',
    name: 'Raw counts',
    uniqueId: 'substrate-a_substrate_raw_counts',
    objectId: 'substrate_raw_counts',
    nodeId: 'substrate-a',
    device: { identifiers: ['substrate-a'] },
    payloadAvailable: 'online',
    payloadNotAvailable: 'offline',
    dangerous: false,
    writable: false,
    raw: {},
    ...patch
  } as EntityConfig;
}

function state(value: string | null): EntityState {
  return { value, updatedAt: '2026-08-11T20:00:00.000Z' };
}

describe('isRecordable', () => {
  it('records sensors and binary sensors', () => {
    expect(isRecordable(entity({ component: 'sensor' }))).toBe(true);
    expect(isRecordable(entity({ component: 'binary_sensor' }))).toBe(true);
  });

  it('skips diagnostics and non-sensor components', () => {
    expect(isRecordable(entity({ component: 'sensor', entityCategory: 'diagnostic' }))).toBe(false);
    expect(isRecordable(entity({ component: 'switch' }))).toBe(false);
  });
});

describe('numericValue', () => {
  const sensor = entity({ component: 'sensor' });

  it('parses a numeric payload', () => {
    expect(numericValue(sensor, state('2618.27'))).toBe(2618.27);
    expect(numericValue(sensor, state('-9999'))).toBe(-9999);
  });

  it('records a genuine zero', () => {
    expect(numericValue(sensor, state('0'))).toBe(0);
    expect(numericValue(sensor, state('0.0'))).toBe(0);
  });

  // The regression: a publisher blanks a stale retained reading with an empty
  // payload when the sensor goes unreachable. Number('') is 0, so recording it
  // wrote a fabricated zero into history for the whole outage.
  it('drops an empty payload rather than coercing it to zero', () => {
    expect(numericValue(sensor, state(''))).toBeNull();
    expect(numericValue(sensor, state('   '))).toBeNull();
    expect(numericValue(sensor, state('\n'))).toBeNull();
  });

  it('drops a null payload and unparseable text', () => {
    expect(numericValue(sensor, state(null))).toBeNull();
    expect(numericValue(sensor, state('unknown'))).toBeNull();
  });

  it('maps binary sensor payloads to 1/0', () => {
    const binary = entity({ component: 'binary_sensor' });
    expect(numericValue(binary, state('ON'))).toBe(1);
    expect(numericValue(binary, state('OFF'))).toBe(0);
    expect(numericValue(binary, state('true'))).toBe(1);
    expect(numericValue(binary, state('0'))).toBe(0);
    expect(numericValue(binary, state(''))).toBeNull();
  });

  it('honours custom binary payloads', () => {
    const binary = entity({ component: 'binary_sensor', payloadOn: 'RUNNING', payloadOff: 'IDLE' });
    expect(numericValue(binary, state('RUNNING'))).toBe(1);
    expect(numericValue(binary, state('IDLE'))).toBe(0);
  });
});
