import { json } from '@sveltejs/kit';
import { getSiteMqttService } from '$lib/server/mqtt/service';

export function GET() {
  return json(getSiteMqttService().snapshot());
}
