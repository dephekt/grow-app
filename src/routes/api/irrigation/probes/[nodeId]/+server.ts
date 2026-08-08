// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authz';
import { getIrrigationDb } from '$lib/server/opensprinkler/db';
import { getZone } from '$lib/server/opensprinkler/zones';
import { deleteProbe, upsertProbe } from '$lib/server/opensprinkler/probes';
import { parseProbePatch } from '$lib/server/opensprinkler/validate';

// Bind or rename one probe — admin only, matching zone config: the binding picks the
// calibration curve and the threshold bands a reading is judged against.
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

  const db = getIrrigationDb();
  // Checked here rather than left to the FK: a bad zone id should read as a 404 naming the
  // zone, not a 500 out of a constraint violation.
  if (patch.zoneId != null && !getZone(db, patch.zoneId)) {
    return json({ ok: false, error: 'Zone not found' }, { status: 404 });
  }

  return json({ ok: true, probe: upsertProbe(db, params.nodeId, patch) });
};

// Forget a probe's binding. The probe keeps publishing and keeps charting; it just goes
// back to unbound, so this destroys no readings.
export const DELETE: RequestHandler = ({ params, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;
  return json({ ok: true, deleted: deleteProbe(getIrrigationDb(), params.nodeId) });
};
