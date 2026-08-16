// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { PageLoadEvent } from './$types';
import type { SubstrateProbeBinding, SubstrateZoneBinding } from '$lib/substrate';
import type { ClimateBriefState } from '../api/climate/+server';

/**
 * How long the dashboard will wait for the zone bindings before rendering without them;
 * `fetch` has no timeout of its own, so a stalled request never settles and never throws.
 */
const ZONES_TIMEOUT_MS = 3000;

/** The dashboard's server-backed reads: zone→probe bindings for the SUBSTRATE card, and the
 *  loop's EFFECTIVE air-VPD target, which an override on /climate can move off the plan. */
export const load = async ({ fetch }: PageLoadEvent) => {
  const empty: SubstrateZoneBinding[] = [];
  const noProbes: SubstrateProbeBinding[] = [];

  const zonesPromise = (async () => {
    try {
      const response = await fetch('/api/irrigation/zones', {
        signal: AbortSignal.timeout(ZONES_TIMEOUT_MS)
      });
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
      const response = await fetch('/api/climate?brief=1', {
        signal: AbortSignal.timeout(ZONES_TIMEOUT_MS)
      });
      if (!response.ok) return null;
      const body = (await response.json()) as Partial<ClimateBriefState>;
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
