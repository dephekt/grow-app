import { json, type RequestHandler } from '@sveltejs/kit';
import { getSiteMqttService } from '$lib/server/mqtt/service';

// The service consumes the retained spectrum before any browser subscribes, so the
// client's live `spectrum` starts null on a fresh load. This supplies the current
// retained frame for first paint (mirrors /api/snapshot). Returns null when none yet.
export const GET: RequestHandler = async () => {
  return json(getSiteMqttService().latestSpectrum());
};
