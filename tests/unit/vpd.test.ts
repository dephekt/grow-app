// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import { leafVpdKpa, liveLeafVpd, saturationVapourPressureKpa } from '../../src/lib/vpd';
import type { DeviceSnapshot, EntityConfig, EntityState, Snapshot } from '../../src/lib/server/mqtt/types';

const RIG = 'atoms3u-sensor-rig';

function makeEntity(
  overrides: Partial<EntityConfig> & { id: string; name: string; objectId: string }
): EntityConfig {
  return {
    component: 'sensor',
    uniqueId: overrides.id,
    nodeId: RIG,
    device: { identifiers: [overrides.nodeId ?? RIG], name: RIG, manufacturer: 'stackdrift', model: RIG },
    payloadAvailable: 'online',
    payloadNotAvailable: 'offline',
    dangerous: false,
    writable: false,
    raw: {},
    ...overrides
  };
}

const roiMean = makeEntity({ id: 'roi_mean', name: 'ROI Mean Temp', objectId: 'mlx90640_roi_mean_temp' });
const airTemp = makeEntity({ id: 'air_t', name: 'Temperature', objectId: 'temperature', deviceClass: 'temperature' });
const humidity = makeEntity({ id: 'rh', name: 'Humidity', objectId: 'humidity', deviceClass: 'humidity' });
const roiSwitch = makeEntity({
  id: 'roi_sw',
  name: 'ROI Enabled',
  objectId: 'roi_enabled',
  component: 'switch',
  writable: true
});

const ALL = [roiMean, airTemp, humidity, roiSwitch];

function makeSnapshot(entities: EntityConfig[], states: Record<string, EntityState>, availability = 'online'): Snapshot {
  const device: DeviceSnapshot = {
    id: RIG,
    nodeId: RIG,
    name: RIG,
    availability,
    entityIds: entities.map((e) => e.id)
  } as DeviceSnapshot;
  return {
    site: 'daniel-home',
    timezone: 'UTC',
    topicPrefix: 'grow/daniel-home',
    discoveryPrefix: 'grow/daniel-home/_discovery',
    generatedAt: '2026-08-11T00:00:00.000Z',
    broker: { connected: true, connecting: false, error: null, lastConnectedAt: null, lastMessageAt: null },
    devices: [device],
    entities,
    states,
    uiConfigs: {},
    lights: [],
    firmware: { devices: {}, channels: {} }
  } as unknown as Snapshot;
}

const state = (value: string): EntityState => ({ value, updatedAt: '2026-08-11T00:00:00.000Z' });

/** Leaf a degree below air, at the tent's typical 25.4 °C / 70 % RH. */
const LIVE_STATES: Record<string, EntityState> = {
  roi_mean: state('24.4'),
  air_t: state('25.4'),
  rh: state('70'),
  roi_sw: state('ON')
};

describe('saturationVapourPressureKpa', () => {
  // Tetens against published reference values.
  it('matches the reference curve', () => {
    expect(saturationVapourPressureKpa(0)).toBeCloseTo(0.611, 3);
    expect(saturationVapourPressureKpa(20)).toBeCloseTo(2.338, 2);
    expect(saturationVapourPressureKpa(25)).toBeCloseTo(3.167, 2);
  });
});

describe('leafVpdKpa', () => {
  // The property that makes the two card rows comparable rather than merely adjacent.
  it('reduces to air VPD when the leaf is at air temperature', () => {
    const airVpd = saturationVapourPressureKpa(25) * (1 - 60 / 100);
    expect(leafVpdKpa(25, 25, 60)).toBeCloseTo(airVpd, 10);
  });

  it('reads lower than air VPD when the leaf is cooler than the air', () => {
    const air = saturationVapourPressureKpa(25) * (1 - 60 / 100);
    expect(leafVpdKpa(23, 25, 60)).toBeLessThan(air);
  });

  it('reads higher than air VPD when the leaf is warmer than the air', () => {
    const air = saturationVapourPressureKpa(25) * (1 - 60 / 100);
    expect(leafVpdKpa(27, 25, 60)).toBeGreaterThan(air);
  });

  it('goes negative when the leaf is below the dew point', () => {
    // 25 °C at 90 % RH dews around 23.2 °C; a 20 °C leaf is condensing.
    expect(leafVpdKpa(20, 25, 90)).toBeLessThan(0);
  });
});

describe('liveLeafVpd', () => {
  it('computes from the ROI mean, air temperature and humidity', () => {
    const vpd = liveLeafVpd(makeSnapshot(ALL, LIVE_STATES));
    expect(vpd).not.toBeNull();
    expect(vpd!).toBeCloseTo(leafVpdKpa(24.4, 25.4, 70), 10);
  });

  // The firmware publishes ROI sensors only while ROI is on, and MQTT retains the last
  // payload — so without this gate a switched-off ROI freezes leaf temperature forever.
  it('is null when the ROI box is switched off', () => {
    expect(liveLeafVpd(makeSnapshot(ALL, { ...LIVE_STATES, roi_sw: state('OFF') }))).toBeNull();
  });

  it('is null when the ROI switch has never reported', () => {
    const { roi_sw: _unused, ...rest } = LIVE_STATES;
    expect(liveLeafVpd(makeSnapshot(ALL, rest))).toBeNull();
  });

  it('is null when the rig exposes no ROI switch at all', () => {
    expect(liveLeafVpd(makeSnapshot([roiMean, airTemp, humidity], LIVE_STATES))).toBeNull();
  });

  it('is null when the publisher is offline', () => {
    expect(liveLeafVpd(makeSnapshot(ALL, LIVE_STATES, 'offline'))).toBeNull();
  });

  it('is null when there is no thermal rig', () => {
    expect(liveLeafVpd(makeSnapshot([airTemp, humidity], LIVE_STATES))).toBeNull();
  });

  it.each(['', '   ', 'nan'])('is null when the ROI temperature reads %o', (bad) => {
    expect(liveLeafVpd(makeSnapshot(ALL, { ...LIVE_STATES, roi_mean: state(bad) }))).toBeNull();
  });

  it('is null when humidity is missing', () => {
    const { rh: _unused, ...rest } = LIVE_STATES;
    expect(liveLeafVpd(makeSnapshot(ALL, rest))).toBeNull();
  });

  // The rig also carries bps_temperature and the daily/moving aggregates; picking one of
  // those as "air" would silently skew every reading.
  it('ignores non-ambient temperatures on the same rig', () => {
    const decoys = [
      makeEntity({ id: 'bps', name: 'Barometric Temp', objectId: 'bps_temperature', deviceClass: 'temperature' }),
      makeEntity({ id: 'dmax', name: 'Daily Max Temp', objectId: 'daily_max_temperature', deviceClass: 'temperature' })
    ];
    const snapshot = makeSnapshot([decoys[0], decoys[1], ...ALL], {
      ...LIVE_STATES,
      bps: state('40'),
      dmax: state('31')
    });
    expect(liveLeafVpd(snapshot)!).toBeCloseTo(leafVpdKpa(24.4, 25.4, 70), 10);
  });
});
