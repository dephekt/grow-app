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

/** The MLX90640 thermal-array MEAN temperature — the representative live reading for
 *  the thermal alarm band (the min/max aggregates bracket it but aren't the "current" value). */
export function isThermalMeanTemp(e: EntityConfig): boolean {
  return isNumericSensor(e) && /mlx90640_mean_temp$/.test(e.objectId ?? '');
}

export function isCo2(e: EntityConfig): boolean {
  return (
    isNumericSensor(e) &&
    (e.deviceClass === 'carbon_dioxide' ||
      /(^|_)co2(_|$)/i.test(e.objectId ?? '') ||
      /co2|carbon diox/i.test(e.name))
  );
}

/**
 * A particulate-matter / gas-index reading (PM1/2.5/4/10, VOC, NOx) — the signals
 * unique to the air-quality monitor, distinct from the CLIMATE rig's CO₂/temp/RH.
 * Used to resolve the AIR QUALITY panel to that device without a hardcoded nodeId.
 */
export function isAirQualityMetric(e: EntityConfig): boolean {
  if (!isNumericSensor(e)) return false;
  if (e.deviceClass === 'pm1' || e.deviceClass === 'pm25' || e.deviceClass === 'pm10') return true;
  const oid = (e.objectId ?? '').toLowerCase();
  // `pm` accepts a separator (pm_2_5, pm__1um) or compact digits (pm25, pm4_0) —
  // PM4 has no HA device class to fall back on.
  return /(^|_)pm(_|\d)/.test(oid) || /(^|_)(voc|nox)(_|$)/.test(oid);
}

/**
 * The Apogee SQ-521 quantum (PAR) sensor's PPFD entity. Keyed on objectId 'ppfd' (there is no HA
 * device_class for PPFD) with a µmol-unit fallback. isNumericSensor already excludes the sibling
 * diagnostic entities, and the historised detector-mV/tilt siblings carry different objectIds and
 * units, so none of them can match.
 */
export function isQuantumPpfd(e: EntityConfig): boolean {
  if (!isNumericSensor(e)) return false;
  if (e.objectId === 'ppfd') return true;
  const u = (e.unit ?? '').toLowerCase();
  return u.includes('µmol') || u.includes('umol');
}

/**
 * The single quantum-PPFD entity, resolved deterministically so the client display and the
 * server-side anchor bind to the SAME sensor regardless of iteration order: an exact objectId
 * 'ppfd' match wins (there is only one), and only in its absence does the first µmol-unit sensor
 * apply as a fallback.
 */
export function findQuantumPpfdEntity(entities: Iterable<EntityConfig>): EntityConfig | undefined {
  let byUnit: EntityConfig | undefined;
  for (const e of entities) {
    if (!isNumericSensor(e)) continue;
    if (e.objectId === 'ppfd') return e;
    if (byUnit === undefined) {
      const u = (e.unit ?? '').toLowerCase();
      if (u.includes('µmol') || u.includes('umol')) byUnit = e;
    }
  }
  return byUnit;
}

/** Whether a quantum-PPFD sensor is registered at all — regardless of liveness. Lets the UI tell
 *  "sensor offline" apart from "no sensor". */
export function hasQuantumPpfd(snapshot: Snapshot): boolean {
  return findQuantumPpfdEntity(snapshot.entities) !== undefined;
}

/**
 * The live Apogee PPFD (µmol·m⁻²·s⁻¹) from the snapshot, or null when the sensor is absent, its
 * value is missing / empty / unparseable, or its owning device is offline — a crashed publisher
 * leaves its retained PPFD scalar on the broker, and treating that as live would pin the canopy
 * readout to a stale number. Dark-offset noise (quantum sensors read slightly negative in darkness)
 * is clamped to 0.
 */
export function liveQuantumPpfd(snapshot: Snapshot): number | null {
  const ent = findQuantumPpfdEntity(snapshot.entities);
  if (!ent) return null;
  // Resolve the owning device by nodeId OR its device identifier (the server keys availability on
  // the latter), so an offline publisher is caught even when the entity carries no nodeId.
  const deviceKey = ent.nodeId ?? ent.device.identifiers[0];
  const device = snapshot.devices.find((d) => d.nodeId === deviceKey || d.id === deviceKey);
  if (device?.availability === 'offline') return null;
  const raw = snapshot.states[ent.id]?.value;
  if (raw == null || raw.trim() === '') return null; // '' → Number('') === 0 would read as a live 0
  const ppfd = Number(raw);
  return Number.isFinite(ppfd) ? Math.max(0, ppfd) : null;
}

/**
 * A live numeric reading (value + unit) from the quantum sensor's OWN device, by objectId — the
 * diagnostics that ride alongside PPFD (detector millivolts, tilt angle). Resolved on the same
 * device as the PPFD entity and availability-gated, so an offline publisher's retained value isn't
 * shown as live, and a sibling with the same objectId on another device can't be picked up.
 */
export function liveQuantumMetric(snapshot: Snapshot, objectId: string): { value: number; unit: string | null } | null {
  const ppfd = findQuantumPpfdEntity(snapshot.entities);
  if (!ppfd) return null;
  const deviceKey = ppfd.nodeId ?? ppfd.device.identifiers[0];
  const device = snapshot.devices.find((d) => d.nodeId === deviceKey || d.id === deviceKey);
  if (device?.availability === 'offline') return null;
  const ent = snapshot.entities.find(
    (e) => e.objectId === objectId && (e.nodeId ?? e.device.identifiers[0]) === deviceKey
  );
  if (!ent) return null;
  const raw = snapshot.states[ent.id]?.value;
  if (raw == null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? { value, unit: ent.unit ?? null } : null;
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
  // The air-quality monitor also reports CO₂/temp/RH but owns the AIR QUALITY
  // card, so it must never win the CLIMATE slot: both rigs name their CO₂ sensor
  // "CO2", and the snapshot's name-sort breaks that tie by discovery arrival
  // order — without this exclusion the winner would flip across restarts.
  const airNodeId = resolveAirQualityDevice(snapshot)?.nodeId;
  const notAirMonitor = (pred: (e: EntityConfig) => boolean) => (e: EntityConfig) =>
    pred(e) && (airNodeId == null || e.nodeId !== airNodeId);
  return (
    deviceOwning(snapshot, notAirMonitor(isCo2)) ??
    deviceOwning(snapshot, notAirMonitor(isHumidity)) ??
    deviceOwning(snapshot, notAirMonitor(isAmbientTemperature))
  );
}

/** THERMAL panel/trends device: the rig carrying the MLX90640 thermal array. */
export function resolveThermalDevice(snapshot: Snapshot): DeviceSnapshot | undefined {
  return deviceOwning(snapshot, isThermalArrayTemp);
}

/**
 * AIR QUALITY panel device: the particulate/gas monitor (PM, VOC, NOx). Separate
 * from CLIMATE so an air-quality rig that also reports CO₂ gets its own card
 * instead of competing with the climate rig for the single CLIMATE slot.
 */
export function resolveAirQualityDevice(snapshot: Snapshot): DeviceSnapshot | undefined {
  return deviceOwning(snapshot, isAirQualityMetric);
}
