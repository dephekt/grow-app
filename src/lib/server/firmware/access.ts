import { timingSafeEqual } from 'node:crypto';
import { json } from '@sveltejs/kit';
import { secretEnv } from '$lib/server/env';

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.byteLength !== right.byteLength) return false;
  return timingSafeEqual(left, right);
}

export function requireFirmwareUpdateToken(url: URL): { token: string } | Response {
  const expected = secretEnv('FIRMWARE_UPDATE_TOKEN');
  if (!expected) {
    return json({ ok: false, error: 'Firmware update token is not configured' }, { status: 503 });
  }

  const token = url.searchParams.get('token');
  if (!token || !constantTimeEquals(token, expected)) {
    return json({ ok: false, error: 'Unauthorized firmware update request' }, { status: 401 });
  }

  return { token };
}
