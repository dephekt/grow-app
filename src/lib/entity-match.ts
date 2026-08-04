// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { DeviceSnapshot, EntityConfig, Snapshot } from '$lib/server/mqtt/types';
import { isNoReadingValue } from '$lib/state-format';

/** Entity recognisers and device resolvers shared by the dashboard panels and the trend charts. */

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

/** Room/air temperature — not the water probe, a substrate probe, a board temp, or an aggregate. */
export function isAmbientTemperature(e: EntityConfig): boolean {
  if (!isNumericSensor(e)) return false;
  if (e.deviceClass !== 'temperature' && e.unit !== '°C') return false;
  const oid = (e.objectId ?? '').toLowerCase();
  const name = e.name.toLowerCase();
  if (/water/.test(oid) || /water/.test(name)) return false;
  // Name-matched too, unlike the hardware-internal words below: "Internal Room Temp" is a
  // legitimate air sensor, "Substrate Temperature" never is.
  if (/(substrate|soil|medium|root)/.test(oid) || /\b(substrate|soil|medium|root)\b/.test(name)) return false;
  if (/(bps|mlx|board|cpu|die|chip|internal)/.test(oid)) return false;
  // Segment-anchored so an id merely containing "max"/"min"/"avg" is not rejected.
  if (/(^|_)(daily|moving|average|avg|min|max|mean)(_|$)/.test(oid)) return false;
  return true;
}

/** An MLX90640 thermal-array aggregate temperature (min/mean/max) — the THERMAL trend metrics. */
export function isThermalArrayTemp(e: EntityConfig): boolean {
  return isNumericSensor(e) && /mlx90640_(min|mean|max)_temp$/.test(e.objectId ?? '');
}

/** The MLX90640 array MEAN temperature — the "current" value for the thermal alarm band. */
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

/** A PM / VOC / NOx reading — the signals unique to the air-quality monitor. */
export function isAirQualityMetric(e: EntityConfig): boolean {
  if (!isNumericSensor(e)) return false;
  if (e.deviceClass === 'pm1' || e.deviceClass === 'pm25' || e.deviceClass === 'pm10') return true;
  const oid = (e.objectId ?? '').toLowerCase();
  // PM4 has no HA device class, so the id must match both separated and compact forms.
  return /(^|_)pm(_|\d)/.test(oid) || /(^|_)(voc|nox)(_|$)/.test(oid);
}

/** The Apogee PPFD entity: objectId 'ppfd', with a µmol-unit fallback since PPFD has no device class. */
export function isQuantumPpfd(e: EntityConfig): boolean {
  if (!isNumericSensor(e)) return false;
  if (e.objectId === 'ppfd') return true;
  // The daily peak carries the same unit as the live reading, so the fallback must exclude it.
  const oid = (e.objectId ?? '').toLowerCase();
  if (/(^|_)(peak|daily|moving|average|avg|min|max|mean|total)(_|$)/.test(oid)) return false;
  const u = (e.unit ?? '').toLowerCase();
  return u.includes('µmol') || u.includes('umol');
}

/** The one PPFD entity, resolved deterministically so client and server bind to the same sensor. */
export function findQuantumPpfdEntity(entities: Iterable<EntityConfig>): EntityConfig | undefined {
  let byUnit: EntityConfig | undefined;
  for (const e of entities) {
    if (e.objectId === 'ppfd' && isNumericSensor(e)) return e;
    // Delegated, not re-tested: a second copy of the µmol check could disagree with isQuantumPpfd.
    if (byUnit === undefined && isQuantumPpfd(e)) byUnit = e;
  }
  return byUnit;
}

/** Whether a PPFD sensor is registered at all, so the UI can tell "offline" from "no sensor". */
export function hasQuantumPpfd(snapshot: Snapshot): boolean {
  return findQuantumPpfdEntity(snapshot.entities) !== undefined;
}

/** Whether an entity published a value it cannot report (`nan`); an entity yet to report is not this. */
export function hasUnreadableState(snapshot: Snapshot, entity: EntityConfig): boolean {
  const raw = snapshot.states[entity.id]?.value;
  return raw != null && isNoReadingValue(raw);
}

/** Live PPFD, or null when absent or stale from an offline publisher; dark-offset noise clamps to 0. */
export function liveQuantumPpfd(snapshot: Snapshot): number | null {
  const ent = findQuantumPpfdEntity(snapshot.entities);
  if (!ent) return null;
  // By nodeId OR device identifier, since the server keys availability on the latter.
  const deviceKey = ent.nodeId ?? ent.device.identifiers[0];
  const device = snapshot.devices.find((d) => d.nodeId === deviceKey || d.id === deviceKey);
  if (device?.availability === 'offline') return null;
  const raw = snapshot.states[ent.id]?.value;
  if (raw == null || raw.trim() === '') return null; // '' → Number('') === 0 would read as a live 0
  const ppfd = Number(raw);
  return Number.isFinite(ppfd) ? Math.max(0, ppfd) : null;
}

/** A reading from the quantum sensor's own device, so a same-named sibling elsewhere cannot win. */
export function liveQuantumMetric(snapshot: Snapshot, objectId: string): number | null {
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
  return Number.isFinite(value) ? value : null;
}

/** The device that owns the first entity matching `pred` (resolved by nodeId). */
export function deviceOwning(
  snapshot: Snapshot,
  pred: (e: EntityConfig) => boolean
): DeviceSnapshot | undefined {
  const e = snapshot.entities.find(pred);
  return e?.nodeId ? snapshot.devices.find((d) => d.nodeId === e.nodeId) : undefined;
}

/** WATER device: the pH probe's, falling back to the water-temperature probe's. */
export function resolveWaterDevice(snapshot: Snapshot): DeviceSnapshot | undefined {
  return deviceOwning(snapshot, isWaterPh) ?? deviceOwning(snapshot, isWaterTemperature);
}

/** CLIMATE device: CO₂, then humidity, then a bare ambient temperature. */
export function resolveClimateDevice(snapshot: Snapshot): DeviceSnapshot | undefined {
  // The air monitor also reports CO₂/temp/RH; without this the CLIMATE winner flips across restarts.
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

/** AIR QUALITY device: the particulate/gas monitor, kept separate from CLIMATE. */
export function resolveAirQualityDevice(snapshot: Snapshot): DeviceSnapshot | undefined {
  return deviceOwning(snapshot, isAirQualityMetric);
}
