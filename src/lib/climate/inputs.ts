// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * Pull everything the control law needs out of one MQTT snapshot.
 *
 * Kept separate from `decide.ts` so the law stays free of entity resolution, and client-safe
 * so /climate can show exactly which sensors the last decision was made on.
 */
import {
  entityNodeKey,
  entityNumericState,
  isAmbientTemperature,
  isEntityOffline,
  isExternalHumidity,
  isExternalTemperature,
  isHumidity,
  isThermalRoiMeanTemp,
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

/** Temperature + RH from one device, or null unless BOTH read — a half-resolved pair would
 *  otherwise compute a VPD against a stale or missing partner. */
function airStateFrom(
  snapshot: Snapshot,
  temp: EntityConfig | undefined,
  humidity: EntityConfig | undefined
): AirState | null {
  if (!temp || !humidity) return null;
  if (isEntityOffline(snapshot, temp) || isEntityOffline(snapshot, humidity)) return null;
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

/**
 * Whether the lamp is on.
 *
 * The relay is authoritative; PPFD is the fallback for a tent whose light plug has not been
 * discovered. Only the predictive gate consumes this (the tent settles warmer than the room
 * under load), so being wrong shifts a prediction rather than moving a relay.
 */
function resolveLightsOn(snapshot: Snapshot): boolean {
  const relay = resolveEntityRef(snapshot, { node: GROW_LIGHT_NODE, objectId: 'grow_light' });
  if (relay) return switchIsOn(snapshot, relay);
  const ppfd = liveQuantumPpfd(snapshot);
  return ppfd !== null && ppfd > 20;
}

export function resolveClimateInputs(snapshot: Snapshot): ClimateInputs {
  const climateDevice = resolveClimateDevice(snapshot);
  const tentNode = climateDevice?.nodeId ?? climateDevice?.id ?? null;
  const onTent = (pred: (e: EntityConfig) => boolean) =>
    tentNode === null ? undefined : snapshot.entities.find((e) => pred(e) && entityNodeKey(e) === tentNode);

  const tent = airStateFrom(snapshot, onTent(isAmbientTemperature), onTent(isHumidity));

  // The room pair is matched by the external-reference guard rather than a hardcoded node, so
  // renaming or replacing the feather does not silently drop the loop's room input.
  const roomTemp = snapshot.entities.find(isExternalTemperature);
  const roomNode = roomTemp ? entityNodeKey(roomTemp) : null;
  const roomHumidity = roomNode
    ? snapshot.entities.find((e) => isExternalHumidity(e) && entityNodeKey(e) === roomNode)
    : undefined;
  const room = airStateFrom(snapshot, roomTemp, roomHumidity);

  const arms = EXHAUST_ARMS.map((objectId): ResolvedArm | null => {
    const entity = resolveEntityRef(snapshot, { node: EXHAUST_NODE, objectId });
    return entity ? { entity, objectId, on: switchIsOn(snapshot, entity) } : null;
  }).filter((arm): arm is ResolvedArm => arm !== null);

  return {
    tent,
    room,
    airVpd: tent ? airVpdKpa(tent.tempC, tent.rhPct) : null,
    // Null whenever the ROI is switched off or its rig is offline — recorded, never regulated.
    leafVpd: snapshot.entities.some(isThermalRoiMeanTemp) ? liveLeafVpd(snapshot) : null,
    lightsOn: resolveLightsOn(snapshot),
    tentNode,
    roomNode,
    exhaust: resolveActuator(snapshot, EXHAUST_NODE, EXHAUST_RELAY),
    humidifier: resolveActuator(snapshot, HUMIDIFIER_NODE, HUMIDIFIER_RELAY),
    arms
  };
}
