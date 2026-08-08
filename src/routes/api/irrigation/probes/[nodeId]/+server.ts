// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authz';
import { getIrrigationDb } from '$lib/server/opensprinkler/db';
import { getZone } from '$lib/server/opensprinkler/zones';
import { deleteProbe, upsertProbe } from '$lib/server/opensprinkler/probes';
import { parseProbePatch } from '$lib/server/opensprinkler/validate';

// Bind or rename one probe — admin only, matching zone config.
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  let patch;
  try {
    patch = parseProbePatch(body);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Invalid probe' }, { status: 400 });
  }

  // Otherwise an empty body would conjure an all-null row for any node id in the URL.
  if (Object.keys(patch).length === 0) {
    return json({ ok: false, error: 'No probe fields to update' }, { status: 400 });
  }

  const db = getIrrigationDb();
  // Checked here rather than left to the FK, so a bad zone id reads as a 404 not a 500.
  if (patch.zoneId != null && !getZone(db, patch.zoneId)) {
    return json({ ok: false, error: 'Zone not found' }, { status: 404 });
  }

  return json({ ok: true, probe: upsertProbe(db, params.nodeId, patch) });
};

// Forget a probe's binding; the probe keeps publishing and keeps charting.
export const DELETE: RequestHandler = ({ params, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;
  return json({ ok: true, deleted: deleteProbe(getIrrigationDb(), params.nodeId) });
};
