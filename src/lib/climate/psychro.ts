// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/** Psychrometrics for the climate loop; client-safe so /climate draws the same numbers the
 *  loop decided on rather than a second approximation of them. */
import { saturationVapourPressureKpa } from '$lib/vpd';

/** Specific gas constant for water vapour, J·kg⁻¹·K⁻¹. */
const R_VAPOUR = 461.5;

export interface AirState {
  tempC: number;
  rhPct: number;
}

/** Actual vapour pressure of air at `tempC` / `rhPct`, kPa. */
export function actualVapourPressureKpa(tempC: number, rhPct: number): number {
  return saturationVapourPressureKpa(tempC) * (rhPct / 100);
}

/** Air (room) VPD in kPa — the quantity the CCI/Homegrower setpoints are stated in, and the
 *  one the loop regulates. */
export function airVpdKpa(tempC: number, rhPct: number): number {
  return saturationVapourPressureKpa(tempC) * (1 - rhPct / 100);
}

/** Absolute humidity in g·m⁻³ — the quantity ventilation actually moves. */
export function absoluteHumidityGPerM3(tempC: number, rhPct: number): number {
  return (actualVapourPressureKpa(tempC, rhPct) * 1e6) / (R_VAPOUR * (tempC + 273.15));
}

/** Measured 2026-08-14 during continuous venting: the tent settles +2.1 °C over the room under
 *  the light's load, and −0.7 °C after dark, where the wet substrate evaporates it below. */
export const VENTED_OFFSET_LIGHTS_ON_C = 2.1;
export const VENTED_OFFSET_LIGHTS_OFF_C = -0.7;

export function ventedOffsetC(lightsOn: boolean): number {
  return lightsOn ? VENTED_OFFSET_LIGHTS_ON_C : VENTED_OFFSET_LIGHTS_OFF_C;
}

/** Air VPD the tent would settle at if fully ventilated right now; vapour pressure carries
 *  over unchanged because heating at constant total pressure conserves the mole fraction. */
export function ventedAirVpdKpa(room: AirState, lightsOn: boolean): number {
  const ventedTempC = room.tempC + ventedOffsetC(lightsOn);
  return saturationVapourPressureKpa(ventedTempC) - actualVapourPressureKpa(room.tempC, room.rhPct);
}
