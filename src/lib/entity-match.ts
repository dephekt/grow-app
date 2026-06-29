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
 * Ambient (room/air) temperature — the reading that represents the grow space,
 * not the water probe, a board/sensor-internal temp (BPS, MLX thermal array, …),
 * or a derived aggregate (daily min/max, moving average). Requires a real
 * temperature signal (deviceClass or °C unit) so it can't fall through to an
 * unrelated sensor that merely has "temp" in its id.
 */
export function isAmbientTemperature(e: EntityConfig): boolean {
  if (!isNumericSensor(e)) return false;
  if (e.deviceClass !== 'temperature' && e.unit !== '°C') return false;
  const oid = (e.objectId ?? '').toLowerCase();
  const name = e.name.toLowerCase();
  if (/water/.test(oid) || /water/.test(name)) return false;
  if (/(bps|mlx|board|cpu|die|chip|internal)/.test(oid)) return false;
  if (/(daily|moving|average|avg|_min|_max|min_|max_)/.test(oid)) return false;
  return true;
}

export function isCo2(e: EntityConfig): boolean {
  return (
    isNumericSensor(e) &&
    (e.deviceClass === 'carbon_dioxide' ||
      /(^|_)co2(_|$)/i.test(e.objectId ?? '') ||
      /co2|carbon diox/i.test(e.name))
  );
}
