// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { normalizeDiscoveryId } from '$lib/server/mqtt/discovery';
import { stationStateTopic } from './normalize';

/**
 * Self-published HA-style discovery for OpenSprinkler stations, which ship none of
 * their own.
 */

const DEVICE = {
  identifiers: ['opensprinkler'],
  name: 'OpenSprinkler',
  manufacturer: 'OpenSprinkler',
  model: 'OpenSprinkler'
} as const;

export interface OsDiscovery {
  topic: string;
  payload: Record<string, unknown>;
}

/** Discovery topic for a station's config (empty payload retracts it). */
export function stationDiscoveryTopic(discoveryPrefix: string, sid: number): string {
  return `${discoveryPrefix}/binary_sensor/opensprinkler/station_${sid}/config`;
}

/** The entity id grow-app derives for a station — `normalizeDiscoveryId(unique_id)`. */
export function stationEntityId(sid: number): string {
  return normalizeDiscoveryId(`opensprinkler_station_${sid}`);
}

/** Inverse of stationEntityId — the station index for a discovered entity id, or
 *  null if it isn't an OpenSprinkler station entity. */
export function stationSidFromEntityId(entityId: string): number | null {
  const match = /^opensprinkler_station_(\d+)$/.exec(entityId);
  return match ? Number(match[1]) : null;
}

export function buildStationDiscovery(opts: {
  discoveryPrefix: string;
  baseTopic: string;
  sid: number;
  name: string;
}): OsDiscovery {
  const { discoveryPrefix, baseTopic, sid, name } = opts;
  return {
    topic: stationDiscoveryTopic(discoveryPrefix, sid),
    payload: {
      name,
      unique_id: `opensprinkler_station_${sid}`,
      object_id: `station_${sid}`,
      state_topic: stationStateTopic(baseTopic, sid),
      payload_on: 'ON',
      payload_off: 'OFF',
      device_class: 'running',
      availability_topic: `${baseTopic}/availability`,
      payload_available: 'online',
      payload_not_available: 'offline',
      device: DEVICE
    }
  };
}
