// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { SubstrateProbeBinding, SubstrateZoneBinding } from '$lib/substrate';

/**
 * How long the dashboard will wait for the zone bindings before rendering without them;
 * `fetch` has no timeout of its own, so a stalled request never settles and never throws.
 */
const ZONES_TIMEOUT_MS = 3000;

/**
 * The dashboard's server-backed reads: the zone→probe bindings the SUBSTRATE card needs to pick
 * a calibration curve, and the climate loop's EFFECTIVE air-VPD target.
 *
 * The target is fetched rather than resolved from WEEKLY_PLAN client-side because an operator
 * can override it on /climate; deriving it here would show the plan's figure while the loop
 * regulated a different one. Null when unavailable, and the card then omits the row rather than
 * guessing.
 */
export const load = async ({ fetch }) => {
  const empty: SubstrateZoneBinding[] = [];
  const noProbes: SubstrateProbeBinding[] = [];

  const zonesPromise = (async () => {
    try {
      const response = await fetch('/api/irrigation/zones', { signal: AbortSignal.timeout(ZONES_TIMEOUT_MS) });
      if (!response.ok) return { zones: empty, probes: noProbes };
      const body = (await response.json()) as {
        zones?: SubstrateZoneBinding[];
        probes?: SubstrateProbeBinding[];
      };
      return { zones: body.zones ?? empty, probes: body.probes ?? noProbes };
    } catch {
      return { zones: empty, probes: noProbes };
    }
  })();

  const climatePromise = (async (): Promise<{ airVpdTarget: number; week: number } | null> => {
    try {
      // `brief` so the dashboard does not pay for a full snapshot walk and control-law
      // evaluation to print two scalars.
      const response = await fetch('/api/climate?brief=1', { signal: AbortSignal.timeout(ZONES_TIMEOUT_MS) });
      if (!response.ok) return null;
      const body = (await response.json()) as { band?: { target?: number }; week?: number };
      const target = body.band?.target;
      if (typeof target !== 'number' || typeof body.week !== 'number') return null;
      return { airVpdTarget: target, week: body.week };
    } catch {
      return null;
    }
  })();

  const [substrate, climate] = await Promise.all([zonesPromise, climatePromise]);
  return { ...substrate, climate };
};
