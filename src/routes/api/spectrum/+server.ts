import { json, error, type RequestHandler } from '@sveltejs/kit';
import { getSiteMqttService } from '$lib/server/mqtt/service';
import { getSpectrumDb } from '$lib/server/spectrum/db';
import { listCaptures, saveCapture } from '$lib/server/spectrum/captures';

export const GET: RequestHandler = async () => {
  return json({ ok: true, captures: listCaptures(getSpectrumDb()) });
};

// Save the CURRENT authoritative in-memory frame as a discrete capture — never trust a
// client-sent spectrum. `label`/`note` are optional metadata.
export const POST: RequestHandler = async ({ request }) => {
  const live = getSiteMqttService().latestSpectrum();
  if (!live) throw error(404, 'No spectrum available to capture');
  const body = (await request.json().catch(() => ({}))) as { label?: string; note?: string };
  const capture = saveCapture(getSpectrumDb(), {
    live,
    label: body.label?.trim() || null,
    note: body.note?.trim() || null
  });
  return json({ ok: true, capture }, { status: 201 });
};
