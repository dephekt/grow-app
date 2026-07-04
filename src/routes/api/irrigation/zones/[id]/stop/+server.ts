import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIrrigationDb } from '$lib/server/opensprinkler/db';
import { getZone } from '$lib/server/opensprinkler/zones';
import { getOpenSprinklerConfig } from '$lib/server/opensprinkler/config';
import { getIrrigationController } from '$lib/server/opensprinkler/controller';

/** Stop a zone's station immediately. Any authenticated user. */
export const POST: RequestHandler = async ({ params }) => {
  if (!getOpenSprinklerConfig().enabled) {
    return json({ ok: false, error: 'OpenSprinkler integration is disabled' }, { status: 503 });
  }

  const zone = getZone(getIrrigationDb(), params.id);
  if (!zone) return json({ ok: false, error: 'Zone not found' }, { status: 404 });

  try {
    await getIrrigationController().stopStation(zone.stationSid);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stop failed';
    return json({ ok: false, error: message }, { status: message.includes('not connected') ? 503 : 500 });
  }

  return json({ ok: true });
};
