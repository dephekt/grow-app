import { json } from '@sveltejs/kit';
import { getSiteMqttService } from '$lib/server/mqtt/service';

export function GET() {
  const snapshot = getSiteMqttService().snapshot();
  const status = snapshot.broker.connected ? 200 : 503;

  return json(
    {
      ok: snapshot.broker.connected,
      site: snapshot.site,
      broker: snapshot.broker,
      entityCount: snapshot.entities.length,
      deviceCount: snapshot.devices.length
    },
    { status }
  );
}
