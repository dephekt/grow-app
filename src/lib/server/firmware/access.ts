import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { json } from '@sveltejs/kit';

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function secretEnv(name: string): string | undefined {
  const direct = env(name);
  if (direct) return direct;

  const file = env(`${name}_FILE`);
  if (!file) return undefined;

  return readFileSync(file, 'utf8').replace(/\r?\n$/, '');
}

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
