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

export type PoreEcOffsetKey = 'coco' | 'rockwool' | 'generic';

/** A value of εσb=0 — the permittivity a medium reads at zero bulk EC, Hilhorst's one free term. */
export interface PoreEcOffset {
  key: PoreEcOffsetKey;
  value: number;
  label: string;
  source: string;
}

/** Published Hilhorst offsets. Coco and rockwool are explicit zone profiles; the generic
 *  TEROS value remains the fallback for other media. */
export const PORE_EC_OFFSETS: Record<PoreEcOffsetKey, PoreEcOffset> = {
  coco: { key: 'coco', value: 1.64, label: 'coco', source: 'Lee & Kim 2024' },
  rockwool: { key: 'rockwool', value: 4.1, label: 'rockwool', source: 'Hilhorst 2000' },
  generic: { key: 'generic', value: 4.1, label: 'generic', source: 'TEROS 11/12 manual' }
};

/** Hilhorst's generic offset (TEROS 12 manual §3.3.4); medium-specific in principle. */
const PERMITTIVITY_AT_ZERO_EC = PORE_EC_OFFSETS.generic.value;

/** METER's stated validity floor for the pore-water model. */
const PORE_EC_MIN_VWC = 0.1;

/** Our own guard against the pole where εb meets the offset, not METER's. */
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
  offset?: number;
}): number | null {
  const { bulkEc, permittivity, temperatureC, vwc, offset = PERMITTIVITY_AT_ZERO_EC } = args;
  if (![bulkEc, permittivity, temperatureC, vwc, offset].every(Number.isFinite)) return null;
  if (bulkEc < 0) return null;
  if (vwc < PORE_EC_MIN_VWC) return null;
  if (permittivity - offset < PORE_EC_MIN_HEADROOM) return null;
  // Permittivity of free water at the measured temperature.
  const waterPermittivity = 80.3 - 0.37 * (temperatureC - 20);
  return (waterPermittivity * bulkEc) / (permittivity - offset);
}

const COCO_MEDIA = /coco|coir/i;
const ROCKWOOL_MEDIA = /rockwool|stonewool/i;
/** Soilless is tested before mineral so "potting soil" resolves where METER puts it. */
const SOILLESS_MEDIA = /peat|perlite|vermiculite|potting|soilless|pro-?mix|sphagnum|bark|hydroton|clay pebble/i;
const MINERAL_MEDIA = /soil|mineral|loam|sand|clay|silt|dirt|field/i;

export type SubstrateCalibrationProfile = 'coco' | 'rockwool' | 'soilless' | 'mineral';

export interface ResolvedSubstrateCalibration {
  profile: SubstrateCalibrationProfile;
  curve: SubstrateCurve;
  poreEcOffset: PoreEcOffset;
  /** False when the zone named no medium, or named one neither pattern recognises. */
  assumed: boolean;
}

const calibration = (
  profile: SubstrateCalibrationProfile,
  curve: SubstrateCurve,
  poreEcOffset: PoreEcOffset,
  assumed = false
): ResolvedSubstrateCalibration => ({ profile, curve, poreEcOffset, assumed });

/** The VWC curve and Hilhorst offset a zone's medium calls for. The explicit defaults are
 *  TEROS soilless + Lee & Kim's 1.64 for coco, and TEROS soilless + Hilhorst's 4.1 for
 *  rockwool. Unknown media retain the prior generic soilless fallback, flagged as assumed. */
export function substrateCalibrationFor(
  substrateType: string | null | undefined
): ResolvedSubstrateCalibration {
  const text = (substrateType ?? '').trim();
  if (text) {
    if (COCO_MEDIA.test(text)) return calibration('coco', 'soilless', PORE_EC_OFFSETS.coco);
    if (ROCKWOOL_MEDIA.test(text)) return calibration('rockwool', 'soilless', PORE_EC_OFFSETS.rockwool);
    if (SOILLESS_MEDIA.test(text)) return calibration('soilless', 'soilless', PORE_EC_OFFSETS.generic);
    if (MINERAL_MEDIA.test(text)) return calibration('mineral', 'mineral', PORE_EC_OFFSETS.generic);
  }
  return calibration('soilless', 'soilless', PORE_EC_OFFSETS.generic, true);
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
  calibrationProfile: SubstrateCalibrationProfile;
  curve: SubstrateCurve;
  poreEcOffset: number;
  calibrationAssumed: boolean;
}

/** One threshold band; a null end is an open side, not a zero. */
export interface SubstrateBand {
  min: number | null;
  max: number | null;
}

/** The bands a zone sets for its probe; `vwcPct` is in percent, not m³/m³. */
export interface SubstrateThresholds {
  vwcPct: SubstrateBand;
  temperatureC: SubstrateBand;
  poreEc: SubstrateBand;
}

/** Where a reading sits in its band; `unknown` covers no reading and no band alike. */
export type BandStatus = 'ok' | 'high' | 'low' | 'unknown';

/** Bounds are inclusive, matching `statusFromLive` in `$lib/alert-status`. */
export function bandStatus(value: number | null, band: SubstrateBand | undefined): BandStatus {
  if (value === null || !Number.isFinite(value) || !band) return 'unknown';
  const { min, max } = band;
  if (min === null && max === null) return 'unknown';
  if (max !== null && value >= max) return 'high';
  if (min !== null && value <= min) return 'low';
  return 'ok';
}

/** Digits each row prints at, shared with the card so one edit moves display and status together. */
export const DISPLAY_DIGITS = { vwc: 1, temperatureC: 1, poreEc: 2 } as const;

/** A reading at the precision the card prints it, so a dot cannot contradict the number beside it. */
export function atDisplayPrecision(value: number | null, digits: number): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

/** The single place m³/m³ becomes percent. */
export function vwcPercent(vwc: number | null): number | null {
  if (vwc === null || !Number.isFinite(vwc)) return null;
  return atDisplayPrecision(vwc * 100, DISPLAY_DIGITS.vwc);
}

/** The client-safe shape of a `substrate_probes` row. */
export interface SubstrateProbeBinding {
  nodeId: string;
  zoneId: string | null;
  /** Free text, e.g. "Gelato A". */
  name?: string | null;
}

/** The zone fields this module needs, structurally — so it never imports server code. */
export interface SubstrateZoneBinding {
  id: string;
  name: string;
  substrateType: string | null;
  vwcMinPct?: number | null;
  vwcMaxPct?: number | null;
  substrateTempMinC?: number | null;
  substrateTempMaxC?: number | null;
  pwecMin?: number | null;
  pwecMax?: number | null;
}

function thresholdsFrom(zone: SubstrateZoneBinding | null): SubstrateThresholds {
  return {
    vwcPct: { min: zone?.vwcMinPct ?? null, max: zone?.vwcMaxPct ?? null },
    temperatureC: { min: zone?.substrateTempMinC ?? null, max: zone?.substrateTempMaxC ?? null },
    poreEc: { min: zone?.pwecMin ?? null, max: zone?.pwecMax ?? null }
  };
}

export interface SubstrateProbe {
  nodeId: string;
  /** Tab label: the plant it sits in when one is named, else the probe's bus letter. */
  label: string;
  deviceName: string;
  /** The bound zone's name, or null when this probe is not assigned to a zone. */
  zoneName: string | null;
  available: boolean;
  serial: string | null;
  substrateType: string | null;
  readings: SubstrateReadings;
  /** The bound zone's bands, all-open when the probe is unbound. */
  thresholds: SubstrateThresholds;
  /** Where each reading sits in its band, keyed to the rows the card renders. */
  status: { vwc: BandStatus; temperatureC: BandStatus; poreEc: BandStatus };
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
  resolved: ResolvedSubstrateCalibration
): SubstrateReadings {
  const { counts, temperatureC, bulkEc } = raw;
  const vwc = counts === null ? null : vwcFromCounts(counts, resolved.curve);
  const permittivity = counts === null ? null : permittivityFromCounts(counts);
  const poreEc =
    bulkEc === null || permittivity === null || temperatureC === null || vwc === null
      ? null
      : poreWaterEc({
          bulkEc,
          permittivity,
          temperatureC,
          vwc,
          offset: resolved.poreEcOffset.value
        });
  return {
    counts,
    temperatureC,
    bulkEc,
    vwc,
    poreEc,
    permittivity,
    calibrationProfile: resolved.profile,
    curve: resolved.curve,
    poreEcOffset: resolved.poreEcOffset.value,
    calibrationAssumed: resolved.assumed
  };
}

/** Every substrate probe in the snapshot, ordered by node id so tabs keep their position. */
export function resolveSubstrateProbes(
  snapshot: Snapshot,
  zones: readonly SubstrateZoneBinding[] = [],
  bindings: readonly SubstrateProbeBinding[] = []
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
    const binding = bindings.find((b) => b.nodeId === node) ?? null;
    const zone = (binding?.zoneId ? zones.find((z) => z.id === binding.zoneId) : null) ?? null;
    const resolved = substrateCalibrationFor(zone?.substrateType);

    const raw = available
      ? {
          counts: liveNumber(snapshot, find(SUBSTRATE_COUNTS)),
          temperatureC: liveNumber(snapshot, find(SUBSTRATE_TEMPERATURE)),
          bulkEc: liveNumber(snapshot, find(SUBSTRATE_BULK_EC))
        }
      : { counts: null, temperatureC: null, bulkEc: null };

    const deviceName = device?.name ?? node;
    const thresholds = thresholdsFrom(zone);
    const readings = deriveReadings(raw, resolved);
    probes.push({
      nodeId: node,
      label: probeLabel(binding, node, deviceName),
      deviceName,
      zoneName: zone?.name ?? null,
      available,
      serial: liveString(snapshot, find(SUBSTRATE_SERIAL)),
      substrateType: zone?.substrateType ?? null,
      readings,
      thresholds,
      status: {
        vwc: bandStatus(vwcPercent(readings.vwc), thresholds.vwcPct),
        temperatureC: bandStatus(
          atDisplayPrecision(readings.temperatureC, DISPLAY_DIGITS.temperatureC),
          thresholds.temperatureC
        ),
        poreEc: bandStatus(atDisplayPrecision(readings.poreEc, DISPLAY_DIGITS.poreEc), thresholds.poreEc)
      }
    });
  }

  return probes.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

/** Whether any substrate probe has been discovered at all — regardless of liveness. */
export function hasSubstrateProbe(snapshot: Snapshot): boolean {
  return snapshot.entities.some(isSubstrateCounts);
}

/** The probe's bus letter — `substrate-a` or `teros-a` → "A". */
function busLetter(nodeId: string): string | null {
  const match = /^(?:substrate|teros)-(.+)$/.exec(nodeId);
  return match ? match[1].toUpperCase() : null;
}

/** What to call a probe: whatever the operator named it, else its bus letter. */
export function probeLabel(
  binding: SubstrateProbeBinding | null | undefined,
  nodeId: string,
  deviceName?: string
): string {
  return (binding?.name ?? '').trim() || busLetter(nodeId) || deviceName || nodeId;
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
