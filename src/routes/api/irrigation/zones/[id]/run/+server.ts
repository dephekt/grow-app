import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIrrigationDb } from '$lib/server/opensprinkler/db';
import { getZone, recordEvent } from '$lib/server/opensprinkler/zones';
import { clampSeconds, resolveShotSeconds } from '$lib/server/opensprinkler/shots';
import { getOpenSprinklerConfig } from '$lib/server/opensprinkler/config';
import { getIrrigationController } from '$lib/server/opensprinkler/controller';

/** Coerce a JSON value (number or numeric string) to a number for the audit log,
 *  or null when absent/non-numeric — so a string `percent`/`ml` isn't logged as null. */
function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Run a zone as a shot. Body accepts one of `{ seconds } | { ml } | { percent }`;
 * ml/percent compile to seconds via the zone's substrate/emitter spec. The result
 * is clamped to the zone's max-run cap, the run is fired, and the event is logged.
 * Any authenticated user may run a zone (the guard in hooks already required a session).
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!getOpenSprinklerConfig().enabled) {
    return json({ ok: false, error: 'OpenSprinkler integration is disabled' }, { status: 503 });
  }

  const db = getIrrigationDb();
  const zone = getZone(db, params.id);
  if (!zone) return json({ ok: false, error: 'Zone not found' }, { status: 404 });
  if (!zone.enabled) return json({ ok: false, error: 'Zone is disabled' }, { status: 409 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  let seconds: number;
  try {
    seconds = clampSeconds(resolveShotSeconds(body, zone), zone.maxRunSeconds);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Invalid shot' }, { status: 400 });
  }

  try {
    await getIrrigationController().runStation(zone.stationSid, seconds);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Run failed';
    return json({ ok: false, error: message }, { status: message.includes('not connected') ? 503 : 500 });
  }

  // The valve has already fired; a failure to write the audit row must not report a
  // successful run as failed (the user would retry an already-running station).
  try {
    recordEvent(db, {
      zoneId: zone.id,
      stationSid: zone.stationSid,
      requestedPercent: numOrNull(body.percent),
      requestedMl: numOrNull(body.ml),
      seconds,
      actor: locals.user?.username ?? null
    });
  } catch (error) {
    console.error('[irrigation] failed to record run event', error);
  }

  return json({ ok: true, seconds });
};
