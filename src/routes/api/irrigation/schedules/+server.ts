import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIrrigationDb } from '$lib/server/opensprinkler/db';
import { getZone } from '$lib/server/opensprinkler/zones';
import { createSchedule, listSchedules, shotResolutionError, toScheduleJson } from '$lib/server/opensprinkler/schedules';
import { parseScheduleCreate } from '$lib/server/opensprinkler/validate';
import { getScheduleTimeZone } from '$lib/server/opensprinkler/schedule-time';
import { requireAdmin } from '$lib/server/auth/authz';

// List schedules — any authenticated user (they view a zone's schedule alongside it).
// Optional ?zoneId= narrows to one zone. Each is enriched with its next-due instant.
export const GET: RequestHandler = ({ url }) => {
  const zoneId = url.searchParams.get('zoneId') ?? undefined;
  const now = Date.now();
  const tz = getScheduleTimeZone();
  const schedules = listSchedules(getIrrigationDb(), zoneId).map((schedule) => toScheduleJson(schedule, now, tz));
  // Return the resolved schedule tz so the UI can render "Next run" in schedule-local
  // time rather than the browser's zone (the instant is already correct either way).
  return json({ ok: true, schedules, tz });
};

// Create a schedule — admin only (a schedule drives physical actuation).
export const POST: RequestHandler = async ({ request, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  let input;
  try {
    input = parseScheduleCreate(body);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Invalid schedule' }, { status: 400 });
  }

  const db = getIrrigationDb();
  const zone = getZone(db, input.zoneId);
  if (!zone) {
    return json({ ok: false, error: 'Zone not found' }, { status: 404 });
  }

  const shotError = shotResolutionError(input, zone);
  if (shotError) return json({ ok: false, error: shotError }, { status: 400 });

  const schedule = createSchedule(db, input);
  return json({ ok: true, schedule: toScheduleJson(schedule, Date.now(), getScheduleTimeZone()) }, { status: 201 });
};
