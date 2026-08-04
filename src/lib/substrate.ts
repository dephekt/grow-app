// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * METER TEROS 11/12 substrate maths, and the probe model behind the SUBSTRATE card
 * and the substrate trend domain.
 *
 * The publisher on the SDI-12 bus (grow-fleet `apogee-sq521`) ships RAW sensor output
 * only — calibrated ADC counts, temperature, and bulk EC, exactly the three values
 * `aD0!` returns. Water content is deliberately NOT computed there, because it is not
 * a property of the sensor: coco, rockwool, peat and mineral soil each need a different
 * curve, and the medium a probe sits in is recorded per zone in this app, not in
 * firmware. Converting here keeps the counts intact in InfluxDB, so re-potting into a
 * different medium re-derives the whole history instead of orphaning it — and changing
 * a zone's medium stays a database write rather than a firmware redeploy.
 *
 * Client-safe: pure maths plus a type-only import of the MQTT types, so the browser
 * bundle can use it. The same functions serve the live card and the history resolver,
 * which is what keeps the readout and the chart from disagreeing about what VWC means.
 */

import type { EntityConfig, Snapshot } from '$lib/server/mqtt/types';
import { isNoReadingValue } from '$lib/state-format';

/**
 * Object ids published by grow-fleet's `internal/substrate`. Every string here is a
 * wire contract shared with that package: the recorder keys InfluxDB series on
 * (node, objectId), so a rename on either side orphans history rather than migrating
 * it. The `substrate_` prefix is also what keeps a probe reporting °C from inside a
 * pot out of the CLIMATE slot — see `isAmbientTemperature` in `$lib/entity-match`.
 */
export const SUBSTRATE_COUNTS = 'substrate_raw_counts';
export const SUBSTRATE_TEMPERATURE = 'substrate_temperature';
export const SUBSTRATE_BULK_EC = 'substrate_bulk_ec';
export const SUBSTRATE_SERIAL = 'substrate_serial';

/** Which of METER's two published calibrations applies to a medium. */
export type SubstrateCurve = 'soilless' | 'mineral';

/**
 * METER's calibrations, TEROS 11/12 manual §4.1. `raw` is the calibrated count the
 * sensor reports as the first `aD0!` value. Coefficients are ordered high power first
 * and evaluated by Horner's method, which is both fewer operations and better
 * conditioned than summing the expanded terms.
 */
// Eq. 7 — soilless media (potting soil, coco, peat, perlite, rockwool).
const SOILLESS_VWC = [6.771e-10, -5.105e-6, 1.302e-2, -10.848] as const;
// Eq. 6 — mineral soil. Linear, so it rides the same evaluator with zeroed cubics.
const MINERAL_VWC = [0, 0, 3.879e-4, -0.6956] as const;
// Eq. 8 — apparent dielectric permittivity is the SQUARE of this cubic.
const PERMITTIVITY = [2.887e-9, -2.08e-5, 5.276e-2, -43.39] as const;

function cubic(c: readonly [number, number, number, number], x: number): number {
  return ((c[0] * x + c[1]) * x + c[2]) * x + c[3];
}

/**
 * The counts the publisher will emit. It applies this same gate before publishing, so
 * this is really a guard on RETAINED payloads written by an older build — MQTT keeps
 * the last value forever, and a stale one outside the sensor's range must not be run
 * through a polynomial that was only ever fitted inside it.
 */
const COUNTS_MIN = 0;
const COUNTS_MAX = 10000;

/**
 * Hilhorst (2000), as given in the TEROS 12 manual §3.3.4: the apparent permittivity
 * a medium shows at zero bulk EC. METER publishes 4.1 as the generic value for both
 * mineral soils and soilless substrates and states the ±20 % accuracy claim against
 * it. It is medium-specific in principle and can be measured per substrate; 4.1 is the
 * documented default and what every consumer probe on the market assumes.
 */
const PERMITTIVITY_AT_ZERO_EC = 4.1;

/**
 * METER's stated validity floor for the pore-water model: below 0.10 m³/m³ there is
 * not enough continuous water for the bulk measurement to say anything about the
 * solution in it.
 */
const PORE_EC_MIN_VWC = 0.1;

/**
 * A numerical guard OF OUR OWN, not from the manual. σp has a pole at
 * εb = 4.1: as the denominator approaches zero the result runs to infinity, so a probe
 * a few counts either side of that point would swing between a plausible number and a
 * wild one. Requiring a full unit of headroom keeps the row honest — below it the row
 * reads "—" instead of a fabricated spike. In coco this costs pore EC below roughly
 * 0.23 m³/m³, the dry end of a hard dryback, which is exactly the region METER's ±20 %
 * claim is weakest in anyway.
 */
const PORE_EC_MIN_HEADROOM = 1;

/**
 * Volumetric water content (m³/m³) from calibrated counts, or null when the counts are
 * outside the sensor's range.
 *
 * Clamped to [0, 1]: both polynomials go negative below roughly 1800 counts, which is
 * drier than any usable medium and is what a probe sitting in air reads. Zero is the
 * honest answer there — air holds no water — rather than a negative volume.
 */
export function vwcFromCounts(counts: number, curve: SubstrateCurve): number | null {
  if (!Number.isFinite(counts) || counts < COUNTS_MIN || counts > COUNTS_MAX) return null;
  const vwc = cubic(curve === 'mineral' ? MINERAL_VWC : SOILLESS_VWC, counts);
  return Math.min(1, Math.max(0, vwc));
}

/**
 * Apparent dielectric permittivity (εb) from calibrated counts — the bridge between
 * the moisture reading and pore-water EC. Substrate-independent: unlike water content,
 * permittivity is what the sensor physically measures, so there is one curve for every
 * medium.
 */
export function permittivityFromCounts(counts: number): number | null {
  if (!Number.isFinite(counts) || counts < COUNTS_MIN || counts > COUNTS_MAX) return null;
  return cubic(PERMITTIVITY, counts) ** 2;
}

/**
 * Pore-water EC (mS/cm) by the Hilhorst model, or null where the model does not hold.
 *
 * This is the number a grower steers on, and it is NOT what the sensor reports. Bulk EC
 * measures the whole volume — water, air and solids together — and the non-conducting
 * fraction drags it far below the concentration of the solution the roots actually sit
 * in: a coco pot at 3.0 mS/cm pore EC reads roughly 0.7 mS/cm bulk. Reporting one as
 * the other under-reads the feed by 3–5x, which is why the card labels both.
 *
 * `bulkEc` and the result share units, since the model is a ratio — pass mS/cm, get
 * mS/cm.
 */
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

/**
 * Media METER's soilless calibration covers, and media its mineral one does. Matched
 * against the zone's free-text substrate type, soilless first so "potting soil" — which
 * contains both words — resolves to soilless, where METER puts it.
 */
const SOILLESS_MEDIA = /coco|coir|peat|perlite|vermiculite|rockwool|stonewool|potting|soilless|pro-?mix|sphagnum|bark|hydroton|clay pebble/i;
const MINERAL_MEDIA = /soil|mineral|loam|sand|clay|silt|dirt|field/i;

export interface ResolvedCurve {
  curve: SubstrateCurve;
  /** False when the zone named no medium, or named one neither pattern recognises. */
  assumed: boolean;
}

/**
 * The calibration a zone's medium calls for.
 *
 * Unrecognised and unset both fall back to soilless rather than refusing to read. This
 * is a hydro/coco app: every medium in the zone editor's own list is soilless, and a
 * mineral default would under-report all of them by roughly six points of VWC. The
 * fallback is flagged so the card can say so instead of implying the medium was
 * configured.
 */
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

/** The single place m³/m³ becomes percent, rounded to what the card prints. */
export const VWC_DISPLAY_DIGITS = 1;

export function vwcPercent(vwc: number | null): number | null {
  if (vwc === null || !Number.isFinite(vwc)) return null;
  return Number((vwc * 100).toFixed(VWC_DISPLAY_DIGITS));
}

/** The zone fields this module needs, structurally — so it never imports server code. */
export interface SubstrateZoneBinding {
  name: string;
  substrateType: string | null;
  substrateNodeId: string | null;
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
  /** Tab label: the bound zone's name when there is one, else the device's own name. */
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

/**
 * A live numeric reading, or null when the entity is absent, has never reported, has
 * published a value it cannot actually report (`nan` from an unplugged probe), or its
 * device is offline. The offline check matters more here than elsewhere: a probe's
 * last reading stays retained on the broker indefinitely, and a pot that was 60 % when
 * the publisher died is not 60 % now.
 */
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

/**
 * Derive the full reading set from one probe's raw values.
 *
 * Exported so the trend resolver can run the identical derivation over history without
 * reaching through a Snapshot.
 */
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

/**
 * Every substrate probe in the snapshot, newest discovery state applied, ordered by
 * node id so the card's tabs keep a stable position as probes come and go.
 *
 * `zones` binds a probe to the medium it is sitting in. A probe no zone claims still
 * reads — it falls back to the soilless curve — because a probe is often in a test pot
 * or a fresh bag before it is ever assigned.
 */
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
    // A node that publishes substrate entities but no counts is not a probe we can
    // read — skip it rather than rendering a card of em-dashes.
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
    const thresholds = thresholdsFrom(zone);
    const readings = deriveReadings(raw, resolved);
    probes.push({
      nodeId: node,
      label: zone?.name ?? deviceName,
      deviceName,
      zoneName: zone?.name ?? null,
      available,
      serial: liveString(snapshot, find(SUBSTRATE_SERIAL)),
      substrateType: zone?.substrateType ?? null,
      readings,
      thresholds,
      status: {
        vwc: bandStatus(vwcPercent(readings.vwc), thresholds.vwcPct),
        temperatureC: bandStatus(readings.temperatureC, thresholds.temperatureC),
        poreEc: bandStatus(readings.poreEc, thresholds.poreEc)
      }
    });
  }

  return probes.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

/** Whether any substrate probe has been discovered at all — regardless of liveness. */
export function hasSubstrateProbe(snapshot: Snapshot): boolean {
  return snapshot.entities.some(isSubstrateCounts);
}

/**
 * Short tab label: the bound zone's name, else the probe's letter off its node id
 * ("substrate-a" → "A"), which is also how the probe is addressed on the SDI-12 bus and
 * how it is labelled on the physical cable.
 */
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
  // A conductivity below zero is not a dry pot, it is a broken electrode, and
  // poreWaterEc refuses it for that reason. Letting it fall through to "too dry"
  // would send someone to irrigate a probe that needs replacing.
  if (readings.bulkEc < 0) return 'bad-bulk-ec';
  return 'too-dry';
}
