import { readFileSync } from 'node:fs';
import { isValidTimeZone } from '$lib/server/tz/valid';

/**
 * IANA zone name → POSIX TZ string, read straight from the on-disk zoneinfo database.
 *
 * ESPHome flashes the glibc/zic-produced POSIX TZ footer of a TZif v2+ file (e.g.
 * `America/Chicago` → `CST6CDT,M3.2.0,M11.1.0`). We hand devices the *byte-identical*
 * footer by reading `/usr/share/zoneinfo/<zone>` ourselves rather than shipping a
 * separate JSON bundle that could drift from what the OS believes. This value is
 * ephemeral: produced here, consumed only at the `publishCommand` boundary, never
 * persisted or snapshotted.
 */
export type PosixResult = { ok: true; posix: string } | { ok: false; reason: string };

/** Reads the raw zoneinfo file for a zone. Injectable so tests can feed a synthetic
 *  footer (over-long, NUL-bearing, v1-only) without touching the filesystem. */
export type ZoneinfoReader = (iana: string) => Buffer;

const defaultReader: ZoneinfoReader = (iana) => readFileSync('/usr/share/zoneinfo/' + iana);

const NEWLINE = 0x0a;
const NUL = 0x00;

/**
 * Extract the TZif v2+ POSIX footer for `iana`. Guard order matters: validate the zone
 * name with `Intl` first, then a strict charset guard (IANA names are `[A-Za-z0-9_+-/]`
 * only — no dot — so this also blocks `../../` path traversal before any fs read), then
 * read the file. A TZif v2+ file ends with `\n<POSIX-TZ>\n`; the footer is the bytes
 * between the final two newlines. Every rejection returns a distinct `reason` so the
 * reconciler's one-shot warning is diagnosable, and the byte-level checks ensure we
 * never emit an empty, NUL-bearing, or >63-byte string to a device.
 */
export function posixTzFromIana(iana: string, readZoneinfo: ZoneinfoReader = defaultReader): PosixResult {
  if (!isValidTimeZone(iana)) return { ok: false, reason: 'invalid-zone' };
  if (!/^[A-Za-z0-9_+-/]+$/.test(iana)) return { ok: false, reason: 'bad-charset' };

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
