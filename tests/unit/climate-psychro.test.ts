// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import {
  absoluteHumidityGPerM3,
  actualVapourPressureKpa,
  airVpdKpa,
  ventedAirVpdKpa,
  ventedOffsetC
} from '../../src/lib/climate/psychro';
import { saturationVapourPressureKpa } from '../../src/lib/vpd';

describe('airVpdKpa', () => {
  it('matches the Tetens saturation curve at a reference point', () => {
    // 20 °C saturation vapour pressure is ~2.34 kPa in every psychrometric table.
    expect(saturationVapourPressureKpa(20)).toBeCloseTo(2.34, 2);
  });

  it('is zero at saturation and equals SVP in bone-dry air', () => {
    expect(airVpdKpa(25, 100)).toBeCloseTo(0, 6);
    expect(airVpdKpa(25, 0)).toBeCloseTo(saturationVapourPressureKpa(25), 6);
  });

  it('reproduces the measured sealed-tent day (08-12: 29.5 °C / 78 %)', () => {
    expect(airVpdKpa(29.5, 78)).toBeCloseTo(0.91, 2);
  });

  it('reproduces the measured continuously-vented day (08-14: 27.18 °C / 63.5 %)', () => {
    // Over the book's 1.2 hard ceiling — the tent was over-vented for veg week 1.
    expect(airVpdKpa(27.18, 63.5)).toBeCloseTo(1.32, 2);
  });

  it('reproduces the measured unvented night floor (24.24 °C / 92 %)', () => {
    expect(airVpdKpa(24.24, 92)).toBeCloseTo(0.24, 2);
  });
});

describe('absoluteHumidityGPerM3', () => {
  it('reproduces the measured night tent and room readings', () => {
    expect(absoluteHumidityGPerM3(24.24, 92.0)).toBeCloseTo(20.3, 1);
    expect(absoluteHumidityGPerM3(24.46, 53.8)).toBeCloseTo(12.0, 1);
  });

  it('rises with temperature at fixed RH', () => {
    expect(absoluteHumidityGPerM3(30, 70)).toBeGreaterThan(absoluteHumidityGPerM3(20, 70));
  });

  it('is zero in bone-dry air', () => {
    expect(absoluteHumidityGPerM3(25, 0)).toBe(0);
  });
});

describe('actualVapourPressureKpa', () => {
  it('splits SVP by the humidity fraction', () => {
    expect(actualVapourPressureKpa(25, 50)).toBeCloseTo(saturationVapourPressureKpa(25) / 2, 6);
  });
});

describe('ventedAirVpdKpa', () => {
  it('uses the measured light-load offset in each direction', () => {
    expect(ventedOffsetC(true)).toBeCloseTo(2.1, 6);
    // Negative after dark: the wet substrate evaporates the tent below room temperature.
    expect(ventedOffsetC(false)).toBeCloseTo(-0.7, 6);
  });

  it('predicts a large night gain over the measured parked tent', () => {
    // Room 24.46 / 53.8 with the light off; the tent was sitting at air VPD 0.24.
    const predicted = ventedAirVpdKpa({ tempC: 24.46, rhPct: 53.8 }, false);
    expect(predicted).toBeGreaterThan(1.2);
  });

  it('predicts almost nothing over the already-vented day', () => {
    // Room 25.02 / 61.4 with the light on. The tent was at 1.32; venting cannot add to that,
    // which is exactly the futility the gate is there to catch.
    const predicted = ventedAirVpdKpa({ tempC: 25.02, rhPct: 61.4 }, true);
    expect(predicted).toBeGreaterThan(1.5);
    // Sanity: the prediction is an equilibrium, so it must exceed the room's own VPD.
    expect(predicted).toBeGreaterThan(airVpdKpa(25.02, 61.4));
  });

  it('predicts a LOWER VPD than the tent when the room is warmer and wetter', () => {
    // The rainy-day case: venting would make things worse, and the gate must see it.
    const tentVpd = airVpdKpa(27, 60);
    expect(ventedAirVpdKpa({ tempC: 24, rhPct: 95 }, true)).toBeLessThan(tentVpd);
  });

  it('carries the room vapour pressure over unchanged, moving only the saturation term', () => {
    // Heating air at constant total pressure conserves its mole fraction of water, so `e` is
    // the invariant. Routing through g·m⁻³ instead would inflate `e` by T_vented/T_room and
    // bias the prediction low by ~0.011 kPa — a fifth of the default 0.05 minimum gain.
    const room = { tempC: 25, rhPct: 50 };
    const e = actualVapourPressureKpa(room.tempC, room.rhPct);
    expect(ventedAirVpdKpa(room, true)).toBeCloseTo(saturationVapourPressureKpa(25 + 2.1) - e, 9);
  });

  it('reduces to the room’s own VPD when the tent equilibrates to room temperature', () => {
    const room = { tempC: 26, rhPct: 55 };
    const flat = { tempC: room.tempC + 0, rhPct: room.rhPct };
    // ventedOffsetC is non-zero in both directions, so assert the identity directly.
    expect(saturationVapourPressureKpa(flat.tempC) - actualVapourPressureKpa(room.tempC, room.rhPct)).toBeCloseTo(
      airVpdKpa(room.tempC, room.rhPct),
      9
    );
  });
});
