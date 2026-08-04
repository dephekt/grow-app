// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/** METER TEROS 11/12 substrate maths and the probe model behind the SUBSTRATE card. */

import type { EntityConfig, Snapshot } from '$lib/server/mqtt/types';
import { isNoReadingValue } from '$lib/state-format';

/** Wire contract with grow-fleet's `internal/substrate`; a rename orphans the InfluxDB series. */
export const SUBSTRATE_COUNTS = 'substrate_raw_counts';
export const SUBSTRATE_TEMPERATURE = 'substrate_temperature';
export const SUBSTRATE_BULK_EC = 'substrate_bulk_ec';
export const SUBSTRATE_SERIAL = 'substrate_serial';

/** Which of METER's two published calibrations applies to a medium. */
export type SubstrateCurve = 'soilless' | 'mineral';

/** METER's calibrations, TEROS 11/12 manual §4.1, high power first. */
// Eq. 7 — soilless media (potting soil, coco, peat, perlite, rockwool).
const SOILLESS_VWC = [6.771e-10, -5.105e-6, 1.302e-2, -10.848] as const;
// Eq. 6 — mineral soil; zeroed cubics so it shares the evaluator.
const MINERAL_VWC = [0, 0, 3.879e-4, -0.6956] as const;
// Eq. 8 — apparent dielectric permittivity is the SQUARE of this cubic.
const PERMITTIVITY = [2.887e-9, -2.08e-5, 5.276e-2, -43.39] as const;

function cubic(c: readonly [number, number, number, number], x: number): number {
  return ((c[0] * x + c[1]) * x + c[2]) * x + c[3];
}

/** Sensor range, re-checked here because a retained payload can predate the publisher's gate. */
const COUNTS_MIN = 0;
const COUNTS_MAX = 10000;

/** Hilhorst's generic offset (TEROS 12 manual §3.3.4); medium-specific in principle. */
const PERMITTIVITY_AT_ZERO_EC = 4.1;

/** METER's stated validity floor for the pore-water model. */
const PORE_EC_MIN_VWC = 0.1;

/** Our own guard against the pole at εb = 4.1, not METER's. */
const PORE_EC_MIN_HEADROOM = 1;

/** Water content (m³/m³) from counts, clamped to a physical volume. */
export function vwcFromCounts(counts: number, curve: SubstrateCurve): number | null {
  if (!Number.isFinite(counts) || counts < COUNTS_MIN || counts > COUNTS_MAX) return null;
  const vwc = cubic(curve === 'mineral' ? MINERAL_VWC : SOILLESS_VWC, counts);
  return Math.min(1, Math.max(0, vwc));
}

/** Apparent permittivity (εb) from counts; substrate-independent, unlike water content. */
export function permittivityFromCounts(counts: number): number | null {
  if (!Number.isFinite(counts) || counts < COUNTS_MIN || counts > COUNTS_MAX) return null;
  return cubic(PERMITTIVITY, counts) ** 2;
}

/** Pore-water EC by Hilhorst, sharing units with `bulkEc` and running several times higher. */
export function poreWaterEc(args: {
  bulkEc: number;
  permittivity: number;
  temperatureC: number;
  vwc: number;
}): number | null {
  const { bulkEc, permittivity, temperatureC, vwc } = args;
  if (![bulkEc, permittivity, temperatureC, vwc].every(Number.isFinite)) return null;
  if (bulkEc < 0) return null;
  if (vwc < PORE_EC_MIN_VWC) return null;
  if (permittivity - PERMITTIVITY_AT_ZERO_EC < PORE_EC_MIN_HEADROOM) return null;
  // Permittivity of free water at the measured temperature.
  const waterPermittivity = 80.3 - 0.37 * (temperatureC - 20);
  return (waterPermittivity * bulkEc) / (permittivity - PERMITTIVITY_AT_ZERO_EC);
}

/** Soilless is tested first so "potting soil" resolves there, where METER puts it. */
const SOILLESS_MEDIA = /coco|coir|peat|perlite|vermiculite|rockwool|stonewool|potting|soilless|pro-?mix|sphagnum|bark|hydroton|clay pebble/i;
const MINERAL_MEDIA = /soil|mineral|loam|sand|clay|silt|dirt|field/i;

export interface ResolvedCurve {
  curve: SubstrateCurve;
  /** False when the zone named no medium, or named one neither pattern recognises. */
  assumed: boolean;
}

/** The calibration a zone's medium calls for; unrecognised falls back to soilless, flagged. */
export function substrateCurveFor(substrateType: string | null | undefined): ResolvedCurve {
  const text = (substrateType ?? '').trim();
  if (text) {
    if (SOILLESS_MEDIA.test(text)) return { curve: 'soilless', assumed: false };
    if (MINERAL_MEDIA.test(text)) return { curve: 'mineral', assumed: false };
  }
  return { curve: 'soilless', assumed: true };
}

/** Everything the SUBSTRATE card shows for one probe, raw and derived. */
export interface SubstrateReadings {
  counts: number | null;
  temperatureC: number | null;
  /** mS/cm, as published. */
  bulkEc: number | null;
  /** m³/m³ in [0, 1] — the card renders it as a percentage. */
  vwc: number | null;
  /** mS/cm; null wherever the Hilhorst model does not hold. */
  poreEc: number | null;
  permittivity: number | null;
  curve: SubstrateCurve;
  curveAssumed: boolean;
}

/** The zone fields this module needs, structurally — so it never imports server code. */
export interface SubstrateZoneBinding {
  name: string;
  substrateType: string | null;
  substrateNodeId: string | null;
}

export interface SubstrateProbe {
  nodeId: string;
  /** Tab label: the bound zone's name when there is one, else the device's own name. */
  label: string;
  deviceName: string;
  /** The bound zone's name, or null when this probe is not assigned to a zone. */
  zoneName: string | null;
  available: boolean;
  serial: string | null;
  substrateType: string | null;
  readings: SubstrateReadings;
}

/** An entity published by a substrate probe, by the object-id prefix its publisher owns. */
export function isSubstrateEntity(e: EntityConfig): boolean {
  return (e.objectId ?? '').startsWith('substrate_');
}

/** The probe's headline entity — its presence is what makes a node a substrate probe. */
export function isSubstrateCounts(e: EntityConfig): boolean {
  return e.component === 'sensor' && e.objectId === SUBSTRATE_COUNTS;
}

function nodeKey(e: EntityConfig): string {
  return e.nodeId ?? e.device.identifiers[0] ?? '';
}

/** A live reading, or null when absent, unreadable, or stale from an offline device. */
function liveNumber(snapshot: Snapshot, entity: EntityConfig | undefined): number | null {
  if (!entity) return null;
  const raw = snapshot.states[entity.id]?.value;
  if (raw == null || raw.trim() === '' || isNoReadingValue(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function liveString(snapshot: Snapshot, entity: EntityConfig | undefined): string | null {
  if (!entity) return null;
  const raw = snapshot.states[entity.id]?.value;
  if (raw == null || raw.trim() === '' || isNoReadingValue(raw)) return null;
  return raw.trim();
}

/** Derive the full reading set from one probe's raw values. */
export function deriveReadings(
  raw: { counts: number | null; temperatureC: number | null; bulkEc: number | null },
  resolved: ResolvedCurve
): SubstrateReadings {
  const { counts, temperatureC, bulkEc } = raw;
  const vwc = counts === null ? null : vwcFromCounts(counts, resolved.curve);
  const permittivity = counts === null ? null : permittivityFromCounts(counts);
  const poreEc =
    bulkEc === null || permittivity === null || temperatureC === null || vwc === null
      ? null
      : poreWaterEc({ bulkEc, permittivity, temperatureC, vwc });
  return {
    counts,
    temperatureC,
    bulkEc,
    vwc,
    poreEc,
    permittivity,
    curve: resolved.curve,
    curveAssumed: resolved.assumed
  };
}

/** Every substrate probe in the snapshot, ordered by node id so tabs keep their position. */
export function resolveSubstrateProbes(
  snapshot: Snapshot,
  zones: readonly SubstrateZoneBinding[] = []
): SubstrateProbe[] {
  const byNode = new Map<string, EntityConfig[]>();
  for (const e of snapshot.entities) {
    if (!isSubstrateEntity(e)) continue;
    const key = nodeKey(e);
    if (!key) continue;
    const list = byNode.get(key);
    if (list) list.push(e);
    else byNode.set(key, [e]);
  }

  const probes: SubstrateProbe[] = [];
  for (const [node, list] of byNode) {
    // No counts means nothing readable.
    if (!list.some(isSubstrateCounts)) continue;

    const find = (objectId: string) => list.find((e) => e.objectId === objectId);
    const device = snapshot.devices.find((d) => d.nodeId === node || d.id === node);
    const available = device?.availability !== 'offline';
    const zone = zones.find((z) => z.substrateNodeId === node) ?? null;
    const resolved = substrateCurveFor(zone?.substrateType);

    const raw = available
      ? {
          counts: liveNumber(snapshot, find(SUBSTRATE_COUNTS)),
          temperatureC: liveNumber(snapshot, find(SUBSTRATE_TEMPERATURE)),
          bulkEc: liveNumber(snapshot, find(SUBSTRATE_BULK_EC))
        }
      : { counts: null, temperatureC: null, bulkEc: null };

    const deviceName = device?.name ?? node;
    probes.push({
      nodeId: node,
      label: zone?.name ?? deviceName,
      deviceName,
      zoneName: zone?.name ?? null,
      available,
      serial: liveString(snapshot, find(SUBSTRATE_SERIAL)),
      substrateType: zone?.substrateType ?? null,
      readings: deriveReadings(raw, resolved)
    });
  }

  return probes.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

/** Whether any substrate probe has been discovered at all — regardless of liveness. */
export function hasSubstrateProbe(snapshot: Snapshot): boolean {
  return snapshot.entities.some(isSubstrateCounts);
}

/** The bound zone's name, else the probe's bus letter ("substrate-a" → "A"). */
export function probeTabLabel(probe: SubstrateProbe): string {
  if (probe.zoneName) return probe.zoneName;
  const match = /^substrate-(.+)$/.exec(probe.nodeId);
  return match ? match[1].toUpperCase() : probe.deviceName;
}

/** Why pore-water EC is missing, so the card can say so rather than show a bare dash. */
export type PoreEcGap = 'offline' | 'no-reading' | 'no-bulk-ec' | 'bad-bulk-ec' | 'too-dry';

export function poreEcGap(probe: SubstrateProbe): PoreEcGap | null {
  const { readings } = probe;
  if (readings.poreEc !== null) return null;
  if (!probe.available) return 'offline';
  if (readings.counts === null || readings.temperatureC === null) return 'no-reading';
  // A TEROS 11 has no EC electrode at all, so the entity never reports.
  if (readings.bulkEc === null) return 'no-bulk-ec';
  // Below zero is a broken electrode, not a dry pot.
  if (readings.bulkEc < 0) return 'bad-bulk-ec';
  return 'too-dry';
}
