import { describe, expect, it } from 'vitest';
import { formatEntityState } from '../../src/lib/state-format';
import type { EntityConfig } from '../../src/lib/server/mqtt/types';

const entity = {
  id: 'atoms3u_vpd',
  component: 'sensor',
  name: 'VPD',
  uniqueId: 'atoms3u_vpd',
  objectId: 'vpd',
  device: { identifiers: ['atoms3u'], name: 'AtomS3U' },
  unit: 'kPa',
  suggestedDisplayPrecision: 2,
  payloadAvailable: 'online',
  payloadNotAvailable: 'offline',
  dangerous: false,
  writable: false,
  raw: {}
} satisfies EntityConfig;

describe('entity state formatting', () => {
  it('formats numeric states with discovery precision', () => {
    expect(formatEntityState(entity, { value: '2.756', updatedAt: null })).toBe('2.76 kPa');
    expect(formatEntityState(entity, { value: '2', updatedAt: null })).toBe('2.00 kPa');
  });

  it('leaves nonnumeric states unchanged', () => {
    expect(formatEntityState(entity, { value: 'ON', updatedAt: null })).toBe('ON kPa');
  });

  it('does not add precision without discovery metadata', () => {
    expect(
      formatEntityState(
        {
          ...entity,
          suggestedDisplayPrecision: undefined
        },
        { value: '2.756', updatedAt: null }
      )
    ).toBe('2.756 kPa');
  });
});

describe('time entity formatting', () => {
  const timeEntity = {
    ...entity,
    component: 'time',
    objectId: 'light_on_time',
    unit: undefined
  } satisfies EntityConfig;

  it('renders HH:MM from the ESPHome JSON blob (seconds dropped)', () => {
    expect(formatEntityState(timeEntity, { value: '{"hour": 18, "minute": 0, "second": 30}', updatedAt: null })).toBe('18:00');
  });

  it('renders HH:MM from a clock string', () => {
    expect(formatEntityState(timeEntity, { value: '06:00:00', updatedAt: null })).toBe('06:00');
  });

  it('shows "No state yet" for an unparseable payload instead of the raw blob', () => {
    expect(formatEntityState(timeEntity, { value: '{bad', updatedAt: null })).toBe('No state yet');
  });
});
