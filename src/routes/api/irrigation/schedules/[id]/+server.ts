import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIrrigationDb } from '$lib/server/opensprinkler/db';
import { getZone } from '$lib/server/opensprinkler/zones';
import { deleteSchedule, getSchedule, shotResolutionError, toScheduleJson, updateSchedule } from '$lib/server/opensprinkler/schedules';
import { parseSchedulePatch } from '$lib/server/opensprinkler/validate';
import { getScheduleTimeZone } from '$lib/server/opensprinkler/schedule-time';
import { requireAdmin } from '$lib/server/auth/authz';

// Update a schedule — admin only.
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const db = getIrrigationDb();
  const existing = getSchedule(db, params.id);
  if (!existing) {
    return json({ ok: false, error: 'Schedule not found' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  let patch;
  try {
    patch = parseSchedulePatch(body);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Invalid schedule' }, { status: 400 });
  }

  // If the patch switches the shot to %/mL, reject at save time when it can't compile
  // against the zone (same immediate feedback as a bad manual run).
  if (patch.shotPercent != null || patch.shotMl != null) {
    const zone = getZone(db, existing.zoneId);
    const shotError = zone && shotResolutionError(patch, zone);
    if (shotError) return json({ ok: false, error: shotError }, { status: 400 });
  }

  const schedule = updateSchedule(db, params.id, patch);
  if (!schedule) return json({ ok: false, error: 'Schedule not found' }, { status: 404 });
  return json({ ok: true, schedule: toScheduleJson(schedule, Date.now(), getScheduleTimeZone()) });
};

// Delete a schedule — admin only.
export const DELETE: RequestHandler = ({ params, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const db = getIrrigationDb();
  if (!deleteSchedule(db, params.id)) {
    return json({ ok: false, error: 'Schedule not found' }, { status: 404 });
  }
  return json({ ok: true });
};
