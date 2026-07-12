import { json, error, type RequestHandler } from '@sveltejs/kit';
import { getSpectrumDb } from '$lib/server/spectrum/db';
import { getCapture } from '$lib/server/spectrum/captures';

export const GET: RequestHandler = async ({ params }) => {
  const capture = params.id ? getCapture(getSpectrumDb(), params.id) : null;
  if (!capture) throw error(404, 'Capture not found');
  return json({ ok: true, capture });
};
