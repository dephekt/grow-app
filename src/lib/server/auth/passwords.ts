// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// maxmem is raised because the default 32 MiB ceiling sits exactly at 128*N*r for these params.
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 96 * 1024 * 1024;

// A fixed salt/length used to burn ~one scrypt when verifying an unknown user or
// a passwordless account, so "no such user" and "wrong password" take similar time.
const DUMMY_SALT = Buffer.alloc(16, 0x2a);

// Async on purpose: the callback API runs on the libuv threadpool, where `scryptSync`
// would block the event loop for the whole derivation.
function derive(
  password: string,
  salt: Buffer,
  keylen: number,
  n: number,
  r: number,
  p: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, { N: n, r, p, maxmem: MAXMEM }, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/** Hash a password into a self-describing `scrypt$N$r$p$saltB64url$hashB64url` string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, KEYLEN, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

interface ParsedHash {
  salt: Buffer;
  hash: Buffer;
  n: number;
  r: number;
  p: number;
}

function parse(stored: string): ParsedHash | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  try {
    return {
      n,
      r,
      p,
      salt: Buffer.from(parts[4], 'base64url'),
      hash: Buffer.from(parts[5], 'base64url')
    };
  } catch {
    return null;
  }
}

/**
 * Always performs a scrypt derivation — even for a null/garbage stored hash — so a missing
 * user, a passwordless account, and a wrong password can't be told apart by timing.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined
): Promise<boolean> {
  const parsed = stored ? parse(stored) : null;
  const salt = parsed?.salt ?? DUMMY_SALT;
  const expected = parsed?.hash ?? Buffer.alloc(KEYLEN, 0);
  const n = parsed?.n ?? N;
  const r = parsed?.r ?? R;
  const p = parsed?.p ?? P;

  let actual: Buffer;
  try {
    actual = await derive(password, salt, expected.length || KEYLEN, n, r, p);
  } catch {
    return false;
  }

  const match = actual.length === expected.length && timingSafeEqual(actual, expected);
  return Boolean(parsed) && match;
}
