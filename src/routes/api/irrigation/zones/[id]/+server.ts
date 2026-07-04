import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIrrigationDb } from '$lib/server/opensprinkler/db';
import { deleteZone, getZone, toZoneJson, updateZone } from '$lib/server/opensprinkler/zones';
import { parseZonePatch } from '$lib/server/opensprinkler/validate';
import { getOpenSprinklerConfig } from '$lib/server/opensprinkler/config';
import { getIrrigationController } from '$lib/server/opensprinkler/controller';
import { requireAdmin } from '$lib/server/auth/authz';

// Update a zone — admin only. Re-publishes station discovery (name may have changed).
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const db = getIrrigationDb();
  const existing = getZone(db, params.id);
  if (!existing) {
    return json({ ok: false, error: 'Zone not found' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  let patch;
  try {
    patch = parseZonePatch(body);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Invalid zone' }, { status: 400 });
  }

  let zone;
  try {
    zone = updateZone(db, params.id, patch);
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
      return json({ ok: false, error: `Station ${patch.stationSid} is already used by another zone` }, { status: 409 });
    }
    throw err;
  }
  if (!zone) return json({ ok: false, error: 'Zone not found' }, { status: 404 });
  if (getOpenSprinklerConfig().enabled) {
    // If the station moved, retract the old station's discovery + retained state so
    // it doesn't linger as an orphan entity, then publish the new station's config.
    if (zone.stationSid !== existing.stationSid) getIrrigationController().retractStation(existing.stationSid);
    getIrrigationController().publishZoneDiscovery(zone);
  }

  return json({ ok: true, zone: toZoneJson(zone) });
};

// Delete a zone — admin only. Retracts the station's retained discovery first.
export const DELETE: RequestHandler = ({ params, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const db = getIrrigationDb();
  const zone = getZone(db, params.id);
  if (!zone) return json({ ok: false, error: 'Zone not found' }, { status: 404 });

  if (getOpenSprinklerConfig().enabled) getIrrigationController().retractStation(zone.stationSid);
  deleteZone(db, params.id);

  return json({ ok: true });
};
