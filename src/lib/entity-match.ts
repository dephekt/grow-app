// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { DeviceSnapshot, EntityConfig, Snapshot } from '$lib/server/mqtt/types';
import { isRetiredDeviceNode } from '$lib/device-retirement';
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

/** An air humidity reading, wherever it is sited; the inside/outside split is applied by the
 *  two callers so the exclusions cannot drift between them, as they did until round 6. */
function isAirHumidity(e: EntityConfig): boolean {
  if (!isNumericSensor(e) || e.deviceClass !== 'humidity') return false;
  const oid = (e.objectId ?? '').toLowerCase();
  const name = e.name.toLowerCase();
  if (/(substrate|soil|medium|root)/.test(oid) || /\b(substrate|soil|medium|root)\b/.test(name)) return false;
  if (/(^|_)(daily|moving|average|avg|min|max|mean)(_|$)/.test(oid)) return false;
  return true;
}

export function isHumidity(e: EntityConfig): boolean {
  return isAirHumidity(e) && !isExternalReference(e);
}

/**
 * An outside-the-grow reference sensor, e.g. the room node the exhaust fan draws from.
 *
 * These read like perfectly good air sensors, which is the problem: resolveClimateDevice
 * falls back to humidity and then ambient temperature, so a room sensor would capture the
 * tent's CLIMATE card whenever the in-tent rig is undiscovered and quietly present room air
 * as canopy air. Anything that genuinely wants the room reads it by node id.
 */
export function isExternalReference(e: EntityConfig): boolean {
  const oid = (e.objectId ?? '').toLowerCase();
  const name = e.name.toLowerCase();
  // Segment/word anchored so "next_temperature" and "Extractor" are not caught.
  return /(^|_)(ext|external|outside|outdoor)(_|$)/.test(oid) || /\b(ext|external|outside|outdoor)\b/.test(name);
}

/**
 * An air-temperature reading, wherever it is sited: not the water probe, a substrate probe, a
 * board temp, a derived aggregate, or a dewpoint.
 *
 * The inside/outside split is applied by the two callers below rather than restated in each,
 * so the exclusion list cannot drift between them — a weaker outside-the-tent matcher is how
 * a dewpoint ends up feeding the climate loop's room reference.
 */
function isAirTemperature(e: EntityConfig): boolean {
  if (!isNumericSensor(e)) return false;
  if (e.deviceClass !== 'temperature' && e.unit !== '°C') return false;
  const oid = (e.objectId ?? '').toLowerCase();
  const name = e.name.toLowerCase();
  if (/water/.test(oid) || /water/.test(name)) return false;
  // Name-matched too, unlike the hardware-internal words below: "Internal Room Temp" is a
  // legitimate air sensor, "Substrate Temperature" never is.
  if (/(substrate|soil|medium|root)/.test(oid) || /\b(substrate|soil|medium|root)\b/.test(name)) return false;
  if (/(bps|mlx|board|cpu|die|chip|internal)/.test(oid)) return false;
  if (/(dew ?point|heat ?index|wet ?bulb)/.test(oid) || /\b(dew ?point|heat ?index|wet ?bulb)\b/.test(name)) {
    return false;
  }
  // Segment-anchored so an id merely containing "max"/"min"/"avg" is not rejected.
  if (/(^|_)(daily|moving|average|avg|min|max|mean)(_|$)/.test(oid)) return false;
  return true;
}

/** The outside-the-tent air temperature — the room the exhaust fan draws from. Matched on the
 *  same guard that keeps it OUT of the CLIMATE card, so the two can never disagree. */
export function isExternalTemperature(e: EntityConfig): boolean {
  return isAirTemperature(e) && isExternalReference(e);
}

/** The outside-the-tent relative humidity. */
export function isExternalHumidity(e: EntityConfig): boolean {
  return isAirHumidity(e) && isExternalReference(e);
}

/** Room/air temperature inside the grow. */
export function isAmbientTemperature(e: EntityConfig): boolean {
  return isAirTemperature(e) && !isExternalReference(e);
}

/** An MLX90640 thermal-array aggregate temperature (min/mean/max) — the THERMAL trend metrics. */
export function isThermalArrayTemp(e: EntityConfig): boolean {
  return isNumericSensor(e) && /mlx90640_(min|mean|max)_temp$/.test(e.objectId ?? '');
}

/** The MLX90640 array MEAN temperature — the "current" value for the thermal alarm band. */
export function isThermalMeanTemp(e: EntityConfig): boolean {
  return isNumericSensor(e) && /mlx90640_mean_temp$/.test(e.objectId ?? '');
}

/** The MLX90640 ROI MEAN temperature — leaf temperature, when the ROI box frames the canopy. */
export function isThermalRoiMeanTemp(e: EntityConfig): boolean {
  return isNumericSensor(e) && /mlx90640_roi_mean_temp$/.test(e.objectId ?? '');
}

/** The rig's air VPD sensor — the row leaf VPD is inserted beside. */
export function isAirVpd(e: EntityConfig): boolean {
  return isNumericSensor(e) && /^(air_)?vpd$/.test((e.objectId ?? '').toLowerCase());
}

export function isCo2(e: EntityConfig): boolean {
  return (
    isNumericSensor(e) &&
    (e.deviceClass === 'carbon_dioxide' ||
      /(^|_)co2(_|$)/i.test(e.objectId ?? '') ||
      /co2|carbon diox/i.test(e.name))
  );
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

/** An entity's state as a finite number, or null when absent, blank or unreadable. Blank is
 *  explicitly not zero — `Number('')` is 0, which reads as a live measurement. */
export function entityNumericState(snapshot: Snapshot, entity: EntityConfig | undefined): number | null {
  if (!entity) return null;
  const raw = snapshot.states[entity.id]?.value;
  if (raw == null || raw.trim() === '' || isNoReadingValue(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
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

/** A (node, objectId) reference. The strict pairing is required because sibling devices
 *  publish colliding objectIds — every Athom plug exposes `voltage`, `current` and
 *  `total_daily_energy`, so an objectId alone resolves to whichever plug sorted first. */
export interface EntityRef {
  node: string;
  objectId: string;
}

/** The node an entity belongs to. `nodeId` is authoritative; the device identifier is the
 *  fallback for entities discovered without one. */
export function entityNodeKey(entity: EntityConfig): string {
  return entity.nodeId ?? entity.device.identifiers[0];
}

/** Resolve a (node, objectId) ref to its discovered entity. */
export function resolveEntityRef(snapshot: Snapshot, ref: EntityRef | undefined): EntityConfig | undefined {
  if (!ref) return undefined;
  return snapshot.entities.find((e) => e.objectId === ref.objectId && entityNodeKey(e) === ref.node);
}

/** The device for a node key, matched on nodeId OR device id: the server keys availability on
 *  `device.identifiers[0]`, but the ESPHome plugs omit device `ids` in discovery so their `d.id`
 *  is a uniq_id slug while `d.nodeId` is reliable. Matching only one form silently misses them. */
export function deviceForNode(snapshot: Snapshot, nodeKey: string): DeviceSnapshot | undefined {
  return snapshot.devices.find((d) => d.nodeId === nodeKey || d.id === nodeKey);
}

/** Whether an entity's device has published an offline LWT. A device that has never published
 *  one reads `unknown`, which is not offline — absence of news is not bad news here. */
export function isEntityOffline(snapshot: Snapshot, entity: EntityConfig | undefined): boolean {
  if (!entity) return false;
  return deviceForNode(snapshot, entityNodeKey(entity))?.availability === 'offline';
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
  const activeDevice = (pred: (e: EntityConfig) => boolean) => (e: EntityConfig) =>
    pred(e) && !isRetiredDeviceNode(e.nodeId ?? e.device.identifiers[0]);
  return (
    deviceOwning(snapshot, activeDevice(isCo2)) ??
    deviceOwning(snapshot, activeDevice(isHumidity)) ??
    deviceOwning(snapshot, activeDevice(isAmbientTemperature))
  );
}

/** THERMAL panel/trends device: the rig carrying the MLX90640 thermal array. */
export function resolveThermalDevice(snapshot: Snapshot): DeviceSnapshot | undefined {
  return deviceOwning(snapshot, isThermalArrayTemp);
}
