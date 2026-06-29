import type { DeviceSnapshot, EntityConfig, Snapshot } from '$lib/server/mqtt/types';

/**
 * Shared entity recognisers + device resolvers used by both the dashboard
 * (`routes/+page.svelte`) and the history layer (`server/influx/trend-domains.ts`),
 * so the WATER/CLIMATE panels and their trend charts agree on which device is "the
 * hydro controller" / "the air rig" and on what counts as the pH / CO₂ / ambient-
 * temperature reading.
 *
 * Type-only import of the MQTT types keeps this module client-safe (no server-only
 * runtime code), matching how the rest of the UI imports those types.
 */

export function isNumericSensor(e: EntityConfig): boolean {
  return e.component === 'sensor' && e.entityCategory !== 'diagnostic';
}

export function isWaterPh(e: EntityConfig): boolean {
  return isNumericSensor(e) && (e.deviceClass === 'ph' || e.objectId === 'water_ph' || e.unit === 'pH');
}

/** The hydro controller's water-temperature probe — the WATER fallback when pH is absent. */
export function isWaterTemperature(e: EntityConfig): boolean {
  if (!isNumericSensor(e)) return false;
  if (e.objectId === 'water_temperature') return true;
  const oid = (e.objectId ?? '').toLowerCase();
  return /water/.test(oid) && (e.deviceClass === 'temperature' || e.unit === '°C');
}

export function isHumidity(e: EntityConfig): boolean {
  return isNumericSensor(e) && e.deviceClass === 'humidity';
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
  // Derived aggregates, anchored to whole id segments so we don't reject a legitimate
  // sensor whose id merely contains "max"/"min"/"avg" as a substring.
  if (/(^|_)(daily|moving|average|avg|min|max|mean)(_|$)/.test(oid)) return false;
  return true;
}

/** An MLX90640 thermal-array aggregate temperature (min/mean/max) — the THERMAL trend metrics. */
export function isThermalArrayTemp(e: EntityConfig): boolean {
  return isNumericSensor(e) && /mlx90640_(min|mean|max)_temp$/.test(e.objectId ?? '');
}

export function isCo2(e: EntityConfig): boolean {
  return (
    isNumericSensor(e) &&
    (e.deviceClass === 'carbon_dioxide' ||
      /(^|_)co2(_|$)/i.test(e.objectId ?? '') ||
      /co2|carbon diox/i.test(e.name))
  );
}

/** The device that owns the first entity matching `pred` (resolved by nodeId). */
export function deviceOwning(
  snapshot: Snapshot,
  pred: (e: EntityConfig) => boolean
): DeviceSnapshot | undefined {
  const e = snapshot.entities.find(pred);
  return e?.nodeId ? snapshot.devices.find((d) => d.nodeId === e.nodeId) : undefined;
}

/**
 * WATER panel/trends device: the hydro controller. Prefer the pH probe's device;
 * fall back to the water-temperature probe's device so a kit with pH unplugged (or
 * discovered late) still resolves to a device and shows its remaining readings.
 */
export function resolveWaterDevice(snapshot: Snapshot): DeviceSnapshot | undefined {
  return deviceOwning(snapshot, isWaterPh) ?? deviceOwning(snapshot, isWaterTemperature);
}

/**
 * CLIMATE panel/trends device: the air rig. Prefer CO₂, then humidity, then a bare
 * ambient-temperature sensor, so a rig that only reports one of those still resolves.
 */
export function resolveClimateDevice(snapshot: Snapshot): DeviceSnapshot | undefined {
  return (
    deviceOwning(snapshot, isCo2) ??
    deviceOwning(snapshot, isHumidity) ??
    deviceOwning(snapshot, isAmbientTemperature)
  );
}

/** THERMAL panel/trends device: the rig carrying the MLX90640 thermal array. */
export function resolveThermalDevice(snapshot: Snapshot): DeviceSnapshot | undefined {
  return deviceOwning(snapshot, isThermalArrayTemp);
}
