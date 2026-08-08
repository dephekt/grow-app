// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { SubstrateProbeBinding, SubstrateZoneBinding } from '$lib/substrate';

/**
 * How long the dashboard will wait for the zone bindings before rendering without them;
 * `fetch` has no timeout of its own, so a stalled request never settles and never throws.
 */
const ZONES_TIMEOUT_MS = 3000;

/**
 * The dashboard's only server-backed read: the zone→probe bindings the SUBSTRATE card needs to
 * pick a calibration curve, degrading to "no bindings" on any failure.
 */
export const load = async ({ fetch }) => {
  const empty: SubstrateZoneBinding[] = [];
  const noProbes: SubstrateProbeBinding[] = [];
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
};
