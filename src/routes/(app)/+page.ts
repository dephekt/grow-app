// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { Zone } from '$lib/server/opensprinkler/zones';
import type { SubstrateZoneBinding } from '$lib/substrate';

/**
 * How long the dashboard will wait for the zone bindings before rendering without them.
 *
 * There has to be a deadline, not just a catch. `fetch` has no timeout of its own, so a
 * stalled request — a blocked irrigation DB, a half-open socket — never settles and
 * never throws: this load would stay pending and the whole dashboard with it, including
 * the five cards that need none of this. Failing fast to the default curve is strictly
 * better than a blank page, since the bindings only refine a reading that already works.
 */
const ZONES_TIMEOUT_MS = 3000;

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
    const response = await fetch('/api/irrigation/zones', { signal: AbortSignal.timeout(ZONES_TIMEOUT_MS) });
    if (!response.ok) return { zones: empty };
    const body = (await response.json()) as { zones?: Zone[] };
    const zones: SubstrateZoneBinding[] = (body.zones ?? []).map((z) => ({
      name: z.name,
      substrateType: z.substrateType,
      substrateNodeId: z.substrateNodeId,
      vwcMinPct: z.vwcMinPct,
      vwcMaxPct: z.vwcMaxPct,
      substrateTempMinC: z.substrateTempMinC,
      substrateTempMaxC: z.substrateTempMaxC,
      pwecMin: z.pwecMin,
      pwecMax: z.pwecMax
    }));
    return { zones };
  } catch {
    return { zones: empty };
  }
};
