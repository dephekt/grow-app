import { describe, expect, it } from 'vitest';
import {
  alertStatus,
  isOff,
  isOn,
  numericStateValue,
  statusFromLive,
  type AlertRuleEntities
} from '../../src/lib/alert-status';
import type { EntityConfig, EntityState } from '../../src/lib/server/mqtt/types';

function mk(
  overrides: Partial<EntityConfig> & { component: string; objectId: string }
): EntityConfig {
  return {
    id: overrides.id ?? `esp${overrides.component}${overrides.objectId}`,
    name: overrides.name ?? overrides.objectId,
    uniqueId: overrides.uniqueId ?? overrides.objectId,
    nodeId: 'atoms3u-sensor-rig',
    device: { identifiers: ['0123456789ab'], name: 'AtomS3U Sensor Rig' },
    payloadAvailable: 'online',
    payloadNotAvailable: 'offline',
    payloadOn: 'ON',
    payloadOff: 'OFF',
    payloadPress: 'PRESS',
    dangerous: false,
    writable: false,
    raw: {},
    ...overrides
  } satisfies EntityConfig;
}

// The scd4x split-high/low shape from the M5Stack AirQ (see commit d39a001:
// co2_low_alert publishes discovery but never a state).
const liveSensor = mk({ component: 'sensor', objectId: 'co2', name: 'CO2' });
const highThreshold = mk({ component: 'number', objectId: 'co2_high_threshold' });
const lowThreshold = mk({ component: 'number', objectId: 'co2_low_threshold' });
const highAlert = mk({ component: 'binary_sensor', objectId: 'co2_high_alert' });
const lowAlert = mk({ component: 'binary_sensor', objectId: 'co2_low_alert' });
// The thermal camera's single-band alarm, with custom on/off payloads.
const genericAlert = mk({ component: 'binary_sensor', objectId: 'thermal_alarm' });
const customAlert = mk({
  component: 'binary_sensor',
  objectId: 'water_alarm',
  payloadOn: 'alarm',
  payloadOff: 'clear'
});

function rule(overrides: Partial<AlertRuleEntities> = {}): AlertRuleEntities {
  return {
    lowEntity: null,
    highEntity: null,
    lowAlertEntity: null,
    highAlertEntity: null,
    genericAlertEntity: null,
    liveEntity: null,
    ...overrides
  };
}

function states(entries: Record<string, string | null>): Record<string, EntityState> {
  return Object.fromEntries(
    Object.entries(entries).map(([id, value]) => [id, { value, updatedAt: '2026-07-08T00:00:00Z' }])
  );
}

// A fully-populated split rule with thresholds 400/900 and a given live value.
function splitRule(): AlertRuleEntities {
  return rule({
    lowEntity: lowThreshold,
    highEntity: highThreshold,
    lowAlertEntity: lowAlert,
    highAlertEntity: highAlert,
    liveEntity: liveSensor
  });
}

function splitStates(overrides: Record<string, string | null> = {}): Record<string, EntityState> {
  return states({
    [lowThreshold.id]: '400',
    [highThreshold.id]: '900',
    [liveSensor.id]: '600',
    ...overrides
  });
}

describe('isOn / isOff', () => {
  it('accepts the default payloads and their boolean-string forms', () => {
    expect(isOn(highAlert, 'ON')).toBe(true);
    expect(isOn(highAlert, 'true')).toBe(true);
    expect(isOff(highAlert, 'OFF')).toBe(true);
    expect(isOff(highAlert, 'false')).toBe(true);
    expect(isOn(highAlert, 'OFF')).toBe(false);
    expect(isOn(highAlert, null)).toBe(false);
    expect(isOff(highAlert, undefined)).toBe(false);
    expect(isOff(highAlert, 'unavailable')).toBe(false);
  });

  it('honours custom discovery payloads and stops accepting the generic forms', () => {
    expect(isOn(customAlert, 'alarm')).toBe(true);
    expect(isOff(customAlert, 'clear')).toBe(true);
    expect(isOn(customAlert, 'ON')).toBe(false);
    expect(isOn(customAlert, 'true')).toBe(false);
    expect(isOff(customAlert, 'OFF')).toBe(false);
    expect(isOff(customAlert, 'false')).toBe(false);
  });
});

describe('numericStateValue', () => {
  it('parses numeric payloads and rejects blank or non-numeric ones', () => {
    expect(numericStateValue(liveSensor, states({ [liveSensor.id]: '612.5' }))).toBe(612.5);
    expect(numericStateValue(liveSensor, states({ [liveSensor.id]: '0' }))).toBe(0);
    expect(numericStateValue(liveSensor, states({ [liveSensor.id]: '' }))).toBeNull();
    expect(numericStateValue(liveSensor, states({ [liveSensor.id]: 'nan' }))).toBeNull();
    expect(numericStateValue(liveSensor, states({}))).toBeNull();
    expect(numericStateValue(null, states({ [liveSensor.id]: '600' }))).toBeNull();
  });

  it('rejects whitespace-only payloads instead of coercing them to 0', () => {
    expect(numericStateValue(liveSensor, states({ [liveSensor.id]: ' ' }))).toBeNull();
    expect(numericStateValue(liveSensor, states({ [liveSensor.id]: '\n' }))).toBeNull();
  });
});

describe('statusFromLive', () => {
  const r = rule({ lowEntity: lowThreshold, highEntity: highThreshold, liveEntity: liveSensor });

  it('compares the live reading against both committed thresholds', () => {
    expect(statusFromLive(r, splitStates())).toBe('OK');
    expect(statusFromLive(r, splitStates({ [liveSensor.id]: '950' }))).toBe('HIGH');
    expect(statusFromLive(r, splitStates({ [liveSensor.id]: '300' }))).toBe('LOW');
  });

  it('is UNKNOWN without a live reading', () => {
    expect(statusFromLive(r, splitStates({ [liveSensor.id]: null }))).toBe('UNKNOWN');
    expect(statusFromLive(rule({ liveEntity: null }), splitStates())).toBe('UNKNOWN');
  });

  it('is UNKNOWN when no threshold resolved — a bare live number proves nothing', () => {
    expect(statusFromLive(r, states({ [liveSensor.id]: '5000' }))).toBe('UNKNOWN');
    expect(statusFromLive(rule({ liveEntity: liveSensor }), states({ [liveSensor.id]: '5000' }))).toBe('UNKNOWN');
  });

  it('works one-sided when only one threshold resolved', () => {
    const oneSided = states({ [highThreshold.id]: '900', [liveSensor.id]: '600' });
    expect(statusFromLive(r, oneSided)).toBe('OK');
    expect(statusFromLive(r, states({ [highThreshold.id]: '900', [liveSensor.id]: '950' }))).toBe('HIGH');
  });

  it('treats a threshold of 0 as a real threshold', () => {
    expect(
      statusFromLive(r, states({ [lowThreshold.id]: '0', [liveSensor.id]: '-1' }))
    ).toBe('LOW');
  });
});

describe('alertStatus: direct alert-sensor states', () => {
  it('reports the direction of an ON directional sensor', () => {
    expect(alertStatus(splitRule(), splitStates({ [highAlert.id]: 'ON' }))).toBe('HIGH');
    expect(alertStatus(splitRule(), splitStates({ [lowAlert.id]: 'ON' }))).toBe('LOW');
    expect(
      alertStatus(splitRule(), splitStates({ [highAlert.id]: 'ON', [lowAlert.id]: 'ON' }))
    ).toBe('ALERT');
  });

  it('recovers direction from live for a combined alert, else ARMED', () => {
    const combined = rule({
      lowEntity: lowThreshold,
      highEntity: highThreshold,
      genericAlertEntity: genericAlert,
      liveEntity: liveSensor
    });
    expect(alertStatus(combined, splitStates({ [genericAlert.id]: 'ON', [liveSensor.id]: '950' }))).toBe('HIGH');
    expect(alertStatus(combined, splitStates({ [genericAlert.id]: 'ON', [liveSensor.id]: '300' }))).toBe('LOW');
    expect(alertStatus(combined, splitStates({ [genericAlert.id]: 'ON' }))).toBe('ARMED');
    expect(alertStatus(combined, states({ [genericAlert.id]: 'ON' }))).toBe('ARMED');
  });

  it('honours custom payloads end to end', () => {
    const custom = rule({ genericAlertEntity: customAlert, liveEntity: liveSensor });
    expect(alertStatus(custom, states({ [customAlert.id]: 'alarm' }))).toBe('ARMED');
    expect(alertStatus(custom, states({ [customAlert.id]: 'clear' }))).toBe('OK');
  });
});

describe('alertStatus: no alert sensors', () => {
  it('passes through the live comparison', () => {
    const r = rule({ lowEntity: lowThreshold, highEntity: highThreshold, liveEntity: liveSensor });
    expect(alertStatus(r, splitStates())).toBe('OK');
    expect(alertStatus(r, splitStates({ [liveSensor.id]: '950' }))).toBe('HIGH');
    expect(alertStatus(r, states({ [liveSensor.id]: '600' }))).toBe('UNKNOWN');
  });
});

describe('alertStatus: full sensor coverage', () => {
  it('is OK when every reporting sensor is off, even against a desynced live reading', () => {
    const bothOff = splitStates({ [highAlert.id]: 'OFF', [lowAlert.id]: 'OFF' });
    expect(alertStatus(splitRule(), bothOff)).toBe('OK');
    // f090fdb: the device's own alarm wins over the threshold comparison.
    expect(
      alertStatus(splitRule(), splitStates({ [highAlert.id]: 'OFF', [lowAlert.id]: 'OFF', [liveSensor.id]: '950' }))
    ).toBe('OK');
  });

  it('is UNKNOWN when a sensor reports something indeterminate', () => {
    expect(
      alertStatus(splitRule(), splitStates({ [highAlert.id]: 'unavailable', [lowAlert.id]: 'OFF' }))
    ).toBe('UNKNOWN');
  });
});

describe('alertStatus: partial sensor coverage (silent paired sensor)', () => {
  // d39a001: the AirQ's co2_low_alert never publishes a state.
  it('falls back to the live reading when the silent direction is quiet', () => {
    expect(alertStatus(splitRule(), splitStates({ [highAlert.id]: 'OFF' }))).toBe('OK');
    expect(alertStatus(splitRule(), splitStates({ [highAlert.id]: 'OFF', [liveSensor.id]: '300' }))).toBe('LOW');
  });

  it('never alerts a direction whose own sensor reports off', () => {
    expect(
      alertStatus(splitRule(), splitStates({ [highAlert.id]: 'OFF', [liveSensor.id]: '950' }))
    ).toBe('OK');
  });

  it('alerts from live when both sensors are silent', () => {
    expect(alertStatus(splitRule(), splitStates({ [liveSensor.id]: '950' }))).toBe('HIGH');
    expect(alertStatus(splitRule(), splitStates())).toBe('OK');
  });

  it('is OK on all-reporting-sensors-off when live is unusable', () => {
    expect(alertStatus(splitRule(), states({ [highAlert.id]: 'OFF' }))).toBe('OK');
  });

  it('is UNKNOWN when nothing has reported and live is unusable', () => {
    expect(alertStatus(splitRule(), states({}))).toBe('UNKNOWN');
  });

  it('does not trust a live reading that resolved no thresholds', () => {
    // A live number with no committed thresholds proves nothing; the silent
    // sensors cannot promote it to OK either.
    expect(alertStatus(splitRule(), states({ [liveSensor.id]: '5000' }))).toBe('UNKNOWN');
    // ...but explicit all-off sensor evidence still yields OK.
    expect(alertStatus(splitRule(), states({ [liveSensor.id]: '5000', [highAlert.id]: 'OFF' }))).toBe('OK');
  });

  it('stays UNKNOWN on live OK when a reporting sensor is indeterminate', () => {
    expect(
      alertStatus(splitRule(), splitStates({ [highAlert.id]: 'unavailable' }))
    ).toBe('UNKNOWN');
  });

  it('still alerts from live past an indeterminate sensor', () => {
    expect(
      alertStatus(splitRule(), splitStates({ [highAlert.id]: 'unavailable', [liveSensor.id]: '950' }))
    ).toBe('HIGH');
  });
});

describe('alertStatus: structurally one-sided sensor coverage', () => {
  // Only a high alert sensor exists; the low direction has no sensor at all,
  // so its status must come from the live reading.
  const oneSided = rule({
    lowEntity: lowThreshold,
    highEntity: highThreshold,
    highAlertEntity: highAlert,
    liveEntity: liveSensor
  });

  it('defers the uncovered direction to the live reading', () => {
    expect(alertStatus(oneSided, splitStates({ [highAlert.id]: 'OFF', [liveSensor.id]: '300' }))).toBe('LOW');
  });

  it('keeps the covered direction with its sensor', () => {
    expect(alertStatus(oneSided, splitStates({ [highAlert.id]: 'OFF', [liveSensor.id]: '950' }))).toBe('OK');
    expect(alertStatus(oneSided, splitStates({ [highAlert.id]: 'OFF' }))).toBe('OK');
    expect(alertStatus(oneSided, states({ [highAlert.id]: 'OFF' }))).toBe('OK');
  });
});
