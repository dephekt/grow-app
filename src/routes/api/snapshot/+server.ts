import { json, type RequestHandler } from '@sveltejs/kit';
import { loadDevSnapshot } from '$lib/server/dev-snapshot';
import { getSiteMqttService } from '$lib/server/mqtt/service';

export const GET: RequestHandler = async ({ fetch }) => {
  const devSnapshot = await loadDevSnapshot(undefined, fetch);
  return json(devSnapshot ?? getSiteMqttService().snapshot());
};
