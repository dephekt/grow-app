import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIrrigationDb } from '$lib/server/opensprinkler/db';
import { createZone, listZones, toZoneJson } from '$lib/server/opensprinkler/zones';
import { parseZoneCreate } from '$lib/server/opensprinkler/validate';
import { getOpenSprinklerConfig } from '$lib/server/opensprinkler/config';
import { getIrrigationController } from '$lib/server/opensprinkler/controller';
import { requireAdmin } from '$lib/server/auth/authz';

// List zones — any authenticated user (they need it to view + run zones).
export const GET: RequestHandler = () => {
  return json({ ok: true, zones: listZones(getIrrigationDb()).map(toZoneJson) });
};

// Create a zone — admin only (zone config drives physical actuation).
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
    input = parseZoneCreate(body);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Invalid zone' }, { status: 400 });
  }

  let zone;
  try {
    zone = createZone(getIrrigationDb(), input);
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
      return json({ ok: false, error: `Station ${input.stationSid} is already used by another zone` }, { status: 409 });
    }
    throw err;
  }
  if (getOpenSprinklerConfig().enabled) getIrrigationController().publishZoneDiscovery(zone);

  return json({ ok: true, zone: toZoneJson(zone) }, { status: 201 });
};
