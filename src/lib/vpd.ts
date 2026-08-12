// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * Leaf VPD — the vapour-pressure deficit the canopy actually experiences, computed
 * against the thermal camera's ROI mean rather than air temperature.
 *
 * Derived here rather than in firmware for the same reason substrate VWC is: the
 * inputs are published raw and the derivation stays changeable without a reflash.
 */
import { isAmbientTemperature, isHumidity, isThermalRoiMeanTemp } from '$lib/entity-match';
import { isNoReadingValue } from '$lib/state-format';
import type { EntityConfig, Snapshot } from '$lib/server/mqtt/types';

/**
 * Tetens saturation vapour pressure in kPa.
 *
 * Deliberately the same curve and coefficients the rig's firmware uses for air VPD
 * (`scd4x_stats.cpp`), so the two rows on the card are comparable rather than merely
 * adjacent — leaf VPD reduces exactly to air VPD when leaf and air temperature match.
 */
export function saturationVapourPressureKpa(tempC: number): number {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

/**
 * Leaf-to-air VPD in kPa: vapour pressure inside the saturated leaf, minus the actual
 * vapour pressure of the surrounding air.
 *
 * Goes negative when the leaf is cold enough that air is condensing onto it.
 */
export function leafVpdKpa(leafTempC: number, airTempC: number, relativeHumidityPct: number): number {
  const airActual = saturationVapourPressureKpa(airTempC) * (relativeHumidityPct / 100);
  return saturationVapourPressureKpa(leafTempC) - airActual;
}

function readNumeric(snapshot: Snapshot, entity: EntityConfig | undefined): number | null {
  if (!entity) return null;
  const raw = snapshot.states[entity.id]?.value;
  if (raw == null || raw.trim() === '' || isNoReadingValue(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Whether the rig's ROI box is switched on.
 *
 * Load-bearing: the firmware publishes the ROI sensors only while ROI is enabled, and
 * MQTT retains the last payload — so a switched-off ROI leaves a stale leaf temperature
 * on the broker forever. Absent switch reads as off, because an ROI that cannot be
 * confirmed live cannot be trusted to be live.
 */
function isRoiEnabled(snapshot: Snapshot, nodeKey: string): boolean {
  const sw = snapshot.entities.find(
    (e) =>
      e.component === 'switch' &&
      e.objectId === 'roi_enabled' &&
      (e.nodeId ?? e.device.identifiers[0]) === nodeKey
  );
  if (!sw) return false;
  const raw = snapshot.states[sw.id]?.value;
  if (raw == null) return false;
  if (raw === (sw.payloadOn ?? 'ON')) return true;
  if (raw === (sw.payloadOff ?? 'OFF')) return false;
  return ['on', 'true', '1'].includes(raw.trim().toLowerCase());
}

/**
 * Live leaf VPD, or null when it cannot be trusted — no thermal rig, ROI switched off,
 * publisher offline, or any of the three inputs missing.
 *
 * Air temperature and humidity are taken from the ROI's own device so leaf VPD is read
 * against the same air the card's air VPD is.
 */
export function liveLeafVpd(snapshot: Snapshot): number | null {
  const roi = snapshot.entities.find(isThermalRoiMeanTemp);
  if (!roi) return null;

  const nodeKey = roi.nodeId ?? roi.device.identifiers[0];
  const device = snapshot.devices.find((d) => d.nodeId === nodeKey || d.id === nodeKey);
  if (device?.availability === 'offline') return null;
  if (!isRoiEnabled(snapshot, nodeKey)) return null;

  const onRig = (pred: (e: EntityConfig) => boolean) =>
    snapshot.entities.find((e) => pred(e) && (e.nodeId ?? e.device.identifiers[0]) === nodeKey);

  const leafTemp = readNumeric(snapshot, roi);
  const airTemp = readNumeric(snapshot, onRig(isAmbientTemperature));
  const humidity = readNumeric(snapshot, onRig(isHumidity));
  if (leafTemp === null || airTemp === null || humidity === null) return null;

  return leafVpdKpa(leafTemp, airTemp, humidity);
}
