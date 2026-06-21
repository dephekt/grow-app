import { json } from '@sveltejs/kit';

export function firmwareError(error: unknown, fallbackStatus = 400): Response {
  const message = error instanceof Error ? error.message : 'Firmware request failed';
  const status = message.includes('not discovered') || message.includes('not bootstrapped')
    ? 409
    : message.includes('not found') || message.includes('Unknown')
      ? 404
      : fallbackStatus;
  return json({ ok: false, error: message }, { status });
}
