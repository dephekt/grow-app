// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/** Pull the control law's inputs out of one MQTT snapshot, so the law itself stays free of
 *  entity resolution. */
import {
  entityNodeKey,
  entityNumericState,
  isAmbientTemperature,
  isEntityOffline,
  isExternalHumidity,
  isExternalTemperature,
  isHumidity,
  liveQuantumPpfd,
  resolveClimateDevice,
  resolveEntityRef
} from '$lib/entity-match';
import { switchIsOn } from '$lib/plugs/model';
import { GROW_LIGHT_NODE } from '$lib/plugs/model';
import { liveLeafVpd } from '$lib/vpd';
import type { EntityConfig, Snapshot } from '$lib/server/mqtt/types';
import { airVpdKpa, type AirState } from './psychro';
import { EXHAUST_ARMS, EXHAUST_NODE, EXHAUST_RELAY, HUMIDIFIER_NODE, HUMIDIFIER_RELAY } from './model';

export interface ResolvedActuator {
  entity: EntityConfig | undefined;
  present: boolean;
  on: boolean;
}

export interface ResolvedArm {
  entity: EntityConfig;
  objectId: string;
  on: boolean;
}

export interface ClimateInputs {
  /** In-tent air, from whichever device owns the CLIMATE card. */
  tent: AirState | null;
  /** Room air outside the tent — what the fan draws from. */
  room: AirState | null;
  /** Instantaneous air VPD; the loop smooths this before deciding. */
  airVpd: number | null;
  leafVpd: number | null;
  lightsOn: boolean;
  /** Node ids behind the two air readings, for the page to name its sources. */
  tentNode: string | null;
  roomNode: string | null;
  exhaust: ResolvedActuator;
  humidifier: ResolvedActuator;
  arms: ResolvedArm[];
}

/** Staleness bound for air readings, measured from RECEIPT — so it catches a node that died
 *  without an LWT, but not a retained value replayed after a broker restart. */
const MAX_READING_AGE_MS = 10 * 60 * 1000;

function isFresh(snapshot: Snapshot, entity: EntityConfig, nowMs: number): boolean {
  const updatedAt = snapshot.states[entity.id]?.updatedAt;
  if (!updatedAt) return false;
  const at = Date.parse(updatedAt);
  return Number.isFinite(at) && nowMs - at <= MAX_READING_AGE_MS;
}

/** Temperature + RH from one device, or null unless BOTH read live — a half-resolved pair would
 *  otherwise compute a VPD against a stale or missing partner. */
function airStateFrom(
  snapshot: Snapshot,
  temp: EntityConfig | undefined,
  humidity: EntityConfig | undefined,
  nowMs: number
): AirState | null {
  if (!temp || !humidity) return null;
  if (isEntityOffline(snapshot, temp) || isEntityOffline(snapshot, humidity)) return null;
  if (!isFresh(snapshot, temp, nowMs) || !isFresh(snapshot, humidity, nowMs)) return null;
  const tempC = entityNumericState(snapshot, temp);
  const rhPct = entityNumericState(snapshot, humidity);
  if (tempC === null || rhPct === null) return null;
  return { tempC, rhPct };
}

function resolveActuator(snapshot: Snapshot, node: string, objectId: string): ResolvedActuator {
  const entity = resolveEntityRef(snapshot, { node, objectId });
  return {
    entity,
    // Offline counts as absent: commanding a plug that has published its LWT cannot land.
    present: entity !== undefined && !isEntityOffline(snapshot, entity),
    on: switchIsOn(snapshot, entity)
  };
}

/** The lamp's state: relay first, PPFD as the fallback. Only the futility gate consumes it,
 *  so being wrong shifts a prediction rather than moving a relay. */
function resolveLightsOn(snapshot: Snapshot): boolean {
  const relay = resolveEntityRef(snapshot, { node: GROW_LIGHT_NODE, objectId: 'grow_light' });
  // Offline falls through to PPFD: discovery outlives the device, and believing its last
  // known position flips the vented-temperature offset by 2.8 °C.
  if (relay && !isEntityOffline(snapshot, relay)) return switchIsOn(snapshot, relay);
  const ppfd = liveQuantumPpfd(snapshot);
  return ppfd !== null && ppfd > 20;
}

export function resolveClimateInputs(snapshot: Snapshot, nowMs: number): ClimateInputs {
  const climateDevice = resolveClimateDevice(snapshot);
  const tentNode = climateDevice?.nodeId ?? climateDevice?.id ?? null;
  const onTent = (pred: (e: EntityConfig) => boolean) =>
    tentNode === null ? undefined : snapshot.entities.find((e) => pred(e) && entityNodeKey(e) === tentNode);

  const tent = airStateFrom(snapshot, onTent(isAmbientTemperature), onTent(isHumidity), nowMs);

  // Matched by the external-reference guard rather than a hardcoded node, but sorted before
  // picking so a second outside sensor cannot switch the gate's input between restarts.
  const roomTemp = snapshot.entities
    .filter(isExternalTemperature)
    .sort((a, b) => `${entityNodeKey(a)}/${a.objectId}`.localeCompare(`${entityNodeKey(b)}/${b.objectId}`))[0];
  const roomNode = roomTemp ? entityNodeKey(roomTemp) : null;
  const roomHumidity = roomNode
    ? snapshot.entities.find((e) => isExternalHumidity(e) && entityNodeKey(e) === roomNode)
    : undefined;
  const room = airStateFrom(snapshot, roomTemp, roomHumidity, nowMs);

  const arms = EXHAUST_ARMS.map((objectId): ResolvedArm | null => {
    const entity = resolveEntityRef(snapshot, { node: EXHAUST_NODE, objectId });
    return entity ? { entity, objectId, on: switchIsOn(snapshot, entity) } : null;
  }).filter((arm): arm is ResolvedArm => arm !== null);

  return {
    tent,
    room,
    airVpd: tent ? airVpdKpa(tent.tempC, tent.rhPct) : null,
    // Null whenever the ROI is switched off or its rig is offline — recorded, never regulated.
    leafVpd: liveLeafVpd(snapshot),
    lightsOn: resolveLightsOn(snapshot),
    tentNode,
    roomNode,
    exhaust: resolveActuator(snapshot, EXHAUST_NODE, EXHAUST_RELAY),
    humidifier: resolveActuator(snapshot, HUMIDIFIER_NODE, HUMIDIFIER_RELAY),
    arms
  };
}
