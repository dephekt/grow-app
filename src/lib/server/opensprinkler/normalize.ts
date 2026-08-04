// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * OpenSprinkler publishes station state as JSON (`{"state":1,"duration":5}`), but grow-app's
 * discovery pipeline stores the raw payload string as the entity state and has no value-template
 * support.
 */

/** The topic the normalized scalar station state is (re)published to. */
export function stationStateTopic(baseTopic: string, sid: number): string {
  return `${baseTopic}/station/${sid}/state`;
}

/**
 * If `topic` is a raw OS station-state topic (`<base>/station/<n>`), return the station index.
 *
 * Deliberately excludes the normalized `<base>/station/<n>/state` topic so republishing can't loop.
 */
export function matchStationTopic(topic: string, baseTopic: string): number | null {
  const prefix = `${baseTopic}/station/`;
  if (!topic.startsWith(prefix)) return null;
  const rest = topic.slice(prefix.length);
  if (!/^\d+$/.test(rest)) return null;
  return Number(rest);
}

/** Parse an OS station payload (`{"state":1|0,...}`) to `ON`/`OFF`, or null if unparseable. */
export function normalizeStationState(payloadText: string): 'ON' | 'OFF' | null {
  let payload: unknown;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return null;
  }
  if (payload && typeof payload === 'object' && 'state' in payload) {
    return Number((payload as { state: unknown }).state) === 1 ? 'ON' : 'OFF';
  }
  return null;
}
