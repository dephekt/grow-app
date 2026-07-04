import { normalizeDiscoveryId } from '$lib/server/mqtt/discovery';
import { stationStateTopic } from './normalize';

/**
 * Self-published HA-style discovery for OpenSprinkler stations. OS ships no
 * discovery, so the driver publishes a retained `binary_sensor` config per zone so
 * each station rides the existing discovery → entity → snapshot/SSE + recorder
 * pipeline. State points at the normalized `<base>/station/<sid>/state` topic (see
 * ./normalize); availability points straight at OS's retained availability LWT.
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

/**
 * The entity id grow-app derives for a station — `normalizeDiscoveryId(unique_id)`.
 * Exposed so the API can hand the frontend the id to look up live state by, without
 * the client re-deriving the convention.
 */
export function stationEntityId(sid: number): string {
  return normalizeDiscoveryId(`opensprinkler_station_${sid}`);
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
