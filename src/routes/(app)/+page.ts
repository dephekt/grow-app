// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { Zone } from '$lib/server/opensprinkler/zones';
import type { SubstrateZoneBinding } from '$lib/substrate';

/**
 * The dashboard's only server-backed read: the zone→probe bindings the SUBSTRATE card
 * needs to pick a calibration curve. Everything else on this page comes from the live
 * MQTT snapshot the shell already holds.
 *
 * Deliberately non-critical. An unbound probe still reads — it falls back to the
 * soilless curve — so a failed, slow or unauthorised fetch degrades to "no bindings"
 * rather than taking down a dashboard whose other five cards need none of this.
 */
export const load = async ({ fetch }) => {
  const empty: SubstrateZoneBinding[] = [];
  try {
    const response = await fetch('/api/irrigation/zones');
    if (!response.ok) return { zones: empty };
    const body = (await response.json()) as { zones?: Zone[] };
    const zones: SubstrateZoneBinding[] = (body.zones ?? []).map((z) => ({
      name: z.name,
      substrateType: z.substrateType,
      substrateNodeId: z.substrateNodeId
    }));
    return { zones };
  } catch {
    return { zones: empty };
  }
};
