import { describe, expect, it } from 'vitest';
import {
  entitySide,
  isAlarmTestButton,
  isAlertEntity,
  isBuzzerSwitch,
  isThresholdEntity,
  metricPrefix
} from '../../src/lib/threshold-match';
import type { EntityConfig } from '../../src/lib/server/mqtt/types';

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

// The thermal camera's single-band alarm, as curated by the AtomS3U _ui/config.
const thermalHigh = mk({ component: 'number', objectId: 'thermal_alarm_high_threshold', name: 'Thermal Alarm High Threshold', unit: '°C', writable: true });
const thermalLow = mk({ component: 'number', objectId: 'thermal_alarm_low_threshold', name: 'Thermal Alarm Low Threshold', unit: '°C', writable: true });
const thermalAlarm = mk({ component: 'binary_sensor', objectId: 'thermal_alarm', name: 'Thermal Alarm', deviceClass: 'problem' });
const thermalBuzzer = mk({ component: 'switch', objectId: 'thermal_buzzer_enabled', name: 'Thermal Buzzer Enabled', writable: true });
const thermalTest = mk({ component: 'button', objectId: 'thermal_alarm_test', name: 'Thermal Alarm Test', writable: true, dangerous: true });
const thermalButton = mk({ component: 'binary_sensor', objectId: 'thermal_button', name: 'Thermal Button' });

// The scd4x split-high/low shape, as a regression guard.
const co2High = mk({ component: 'number', objectId: 'co2_high_threshold', name: 'CO2 High Threshold' });
const co2HighAlert = mk({ component: 'binary_sensor', objectId: 'co2_high_alert', name: 'CO2 High Alert' });

describe('isAlertEntity', () => {
  it('recognises the split-side scd4x alert binaries (regression)', () => {
    expect(isAlertEntity(co2HighAlert)).toBe(true);
  });

  it('recognises the single-band thermal_alarm by name', () => {
    expect(isAlertEntity(thermalAlarm)).toBe(true);
  });

  it('recognises an alarm binary by device_class problem alone', () => {
    const problemOnly = mk({ component: 'binary_sensor', objectId: 'freeze_guard', name: 'Freeze Guard', deviceClass: 'problem' });
    expect(isAlertEntity(problemOnly)).toBe(true);
  });

  it('does not treat the physical button binary as an alert', () => {
    expect(isAlertEntity(thermalButton)).toBe(false);
  });

  it('ignores non-binary_sensor components', () => {
    expect(isAlertEntity(thermalHigh)).toBe(false);
    expect(isAlertEntity(thermalTest)).toBe(false);
  });
});

describe('isThresholdEntity', () => {
  it('recognises the thermal threshold numbers', () => {
    expect(isThresholdEntity(thermalHigh)).toBe(true);
    expect(isThresholdEntity(thermalLow)).toBe(true);
  });

  it('does not treat the alarm binary as a threshold', () => {
    expect(isThresholdEntity(thermalAlarm)).toBe(false);
  });
});

describe('metricPrefix pairs the thermal band', () => {
  it('groups both thresholds and the alarm under one metric', () => {
    expect(metricPrefix(thermalHigh)).toBe('thermal_alarm');
    expect(metricPrefix(thermalLow)).toBe('thermal_alarm');
    expect(metricPrefix(thermalAlarm)).toBe('thermal_alarm');
  });

  it('still strips scd4x split sides (regression)', () => {
    expect(metricPrefix(co2High)).toBe('co2');
    expect(metricPrefix(co2HighAlert)).toBe('co2');
  });
});

describe('entitySide', () => {
  it('reads the thermal threshold sides', () => {
    expect(entitySide(thermalHigh)).toBe('high');
    expect(entitySide(thermalLow)).toBe('low');
  });

  it('treats the single combined alarm as generic (no side)', () => {
    expect(entitySide(thermalAlarm)).toBeNull();
  });
});

describe('isBuzzerSwitch', () => {
  it('recognises the buzzer-mute switch', () => {
    expect(isBuzzerSwitch(thermalBuzzer)).toBe(true);
  });

  it('rejects non-switches and non-buzzer switches', () => {
    expect(isBuzzerSwitch(thermalAlarm)).toBe(false);
    expect(isBuzzerSwitch(mk({ component: 'switch', objectId: 'thermal_overlay_enable', name: 'Thermal Overlay Enable' }))).toBe(false);
  });
});

describe('isAlarmTestButton', () => {
  it('recognises the alarm sound-test button', () => {
    expect(isAlarmTestButton(thermalTest)).toBe(true);
  });

  it('rejects the alarm binary and unrelated buttons', () => {
    expect(isAlarmTestButton(thermalAlarm)).toBe(false);
    expect(isAlarmTestButton(mk({ component: 'button', objectId: 'restart', name: 'Restart' }))).toBe(false);
  });
});
