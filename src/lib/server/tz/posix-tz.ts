// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { readFileSync } from 'node:fs';
import { isValidTimeZone } from '$lib/server/tz/valid';

/**
 * IANA zone name → POSIX TZ string, read straight from the on-disk zoneinfo database.
 */
export type PosixResult = { ok: true; posix: string } | { ok: false; reason: string };

/** Reads the raw zoneinfo file for a zone; injectable so tests can feed a synthetic footer. */
export type ZoneinfoReader = (iana: string) => Buffer;

const defaultReader: ZoneinfoReader = (iana) => readFileSync('/usr/share/zoneinfo/' + iana);

const NEWLINE = 0x0a;
const NUL = 0x00;

/**
 * Extract the TZif v2+ POSIX footer for `iana` — the bytes between the file's final two newlines.
 *
 * Guard order matters: the charset check rejects dot-bearing input (path traversal) before any
 * fs read.
 */
export function posixTzFromIana(iana: string, readZoneinfo: ZoneinfoReader = defaultReader): PosixResult {
  if (!isValidTimeZone(iana)) return { ok: false, reason: 'invalid-zone' };
  // `-` is last so it is a literal, not a `+`..`/` range that would admit `.` and `,`.
  if (!/^[A-Za-z0-9_+/-]+$/.test(iana)) return { ok: false, reason: 'bad-charset' };

  let buf: Buffer;
  try {
    buf = readZoneinfo(iana);
  } catch {
    return { ok: false, reason: 'read-failed' };
  }

  if (buf.length === 0) return { ok: false, reason: 'empty-file' };
  // TZif v1-only files (and truncated ones) lack the trailing-newline-wrapped footer.
  if (buf[buf.length - 1] !== NEWLINE) return { ok: false, reason: 'no-footer' };
  const prevNewline = buf.lastIndexOf(NEWLINE, buf.length - 2);
  if (prevNewline === -1) return { ok: false, reason: 'no-footer' };

  const footer = buf.subarray(prevNewline + 1, buf.length - 1);
  if (footer.length === 0) return { ok: false, reason: 'empty-footer' };
  if (footer.includes(NUL)) return { ok: false, reason: 'nul-byte' };
  if (footer.length > 63) return { ok: false, reason: 'too-long' };

  return { ok: true, posix: footer.toString('latin1') };
}
