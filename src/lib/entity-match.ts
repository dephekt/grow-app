import type { EntityConfig } from '$lib/server/mqtt/types';

/**
 * Shared entity recognisers used by both the server (trend-series resolution) and
 * the client (dashboard panel binding), so the dashboard and the history layer
 * agree on what counts as "the pH probe" / "ambient temperature" / "the CO₂ sensor".
 *
 * Type-only import of EntityConfig keeps this module client-safe (no server-only
 * runtime code), matching how the rest of the UI imports the MQTT types.
 */

export function isNumericSensor(e: EntityConfig): boolean {
  return e.component === 'sensor' && e.entityCategory !== 'diagnostic';
}

export function isWaterPh(e: EntityConfig): boolean {
  return isNumericSensor(e) && (e.deviceClass === 'ph' || e.objectId === 'water_ph' || e.unit === 'pH');
}

/**
 * Ambient (non-water) temperature. ESPHome often leaves deviceClass unset, so fall
 * back to unit / objectId; exclude the water probe, which is its own reading.
 */
export function isAmbientTemperature(e: EntityConfig): boolean {
  return (
    isNumericSensor(e) &&
    (e.deviceClass === 'temperature' || e.unit === '°C' || /temp/i.test(e.objectId ?? '')) &&
    !/water/i.test(e.objectId ?? '') &&
    !/water/i.test(e.name)
  );
}

export function isCo2(e: EntityConfig): boolean {
  return (
    isNumericSensor(e) &&
    (e.deviceClass === 'carbon_dioxide' ||
      /(^|_)co2(_|$)/i.test(e.objectId ?? '') ||
      /co2|carbon diox/i.test(e.name))
  );
}
