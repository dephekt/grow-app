// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * Psychrometrics for the climate loop: air VPD, absolute humidity, and the ventilated
 * equilibrium the exhaust decision is gated on.
 *
 * Client-safe (no server imports) so the /climate page can draw the same numbers the loop
 * decided on rather than a second approximation of them.
 */
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

/**
 * Air (room) VPD in kPa — saturation minus actual at the same temperature.
 *
 * This is the quantity the CCI/Homegrower setpoints are stated in, and the one the loop
 * regulates. Leaf VPD is the better physiology but depends on the thermal ROI staying
 * switched on, so it rides along as a cross-check rather than as the control input.
 */
export function airVpdKpa(tempC: number, rhPct: number): number {
  return saturationVapourPressureKpa(tempC) * (1 - rhPct / 100);
}

/** Absolute humidity in g·m⁻³ — the quantity ventilation actually moves. */
export function absoluteHumidityGPerM3(tempC: number, rhPct: number): number {
  return (actualVapourPressureKpa(tempC, rhPct) * 1e6) / (R_VAPOUR * (tempC + 273.15));
}

/** Relative humidity that `ah` g·m⁻³ represents at `tempC`. */
export function relativeHumidityPct(tempC: number, ah: number): number {
  const e = (ah * R_VAPOUR * (tempC + 273.15)) / 1e6;
  return (e / saturationVapourPressureKpa(tempC)) * 100;
}

/**
 * How much warmer the tent settles than the room once it is fully ventilated.
 *
 * Measured 2026-08-14 against `feather-air-monitor` during continuous venting: +2.1 °C with
 * the light on (its heat load), and −0.7 °C with it off — the tent runs *cooler* than the
 * room after dark because the wet substrate is evaporating.
 */
export const VENTED_OFFSET_LIGHTS_ON_C = 2.1;
export const VENTED_OFFSET_LIGHTS_OFF_C = -0.7;

export function ventedOffsetC(lightsOn: boolean): number {
  return lightsOn ? VENTED_OFFSET_LIGHTS_ON_C : VENTED_OFFSET_LIGHTS_OFF_C;
}

/**
 * Air VPD the tent would settle at if it were fully ventilated with room air right now.
 *
 * The tent converges on the room's absolute humidity (that is what the fan exchanges) at a
 * temperature the light's heat load holds above it. Used to gate starting the fan: if this
 * is not meaningfully better than the current reading, venting cannot fix anything and the
 * loop should leave the relay alone.
 */
export function ventedAirVpdKpa(room: AirState, lightsOn: boolean): number {
  const ventedTempC = room.tempC + ventedOffsetC(lightsOn);
  const ah = absoluteHumidityGPerM3(room.tempC, room.rhPct);
  const e = (ah * R_VAPOUR * (ventedTempC + 273.15)) / 1e6;
  return saturationVapourPressureKpa(ventedTempC) - e;
}
