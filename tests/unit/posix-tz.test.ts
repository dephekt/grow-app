import { describe, expect, it, vi } from 'vitest';
import { posixTzFromIana, type ZoneinfoReader } from '../../src/lib/server/tz/posix-tz';

/** Wrap a synthetic footer body the way a real TZif v2+ file ends it: `\n<body>\n`,
 *  preceded by arbitrary header bytes the extractor must skip past. */
function footerFile(body: Buffer | string): Buffer {
  const bytes = typeof body === 'string' ? Buffer.from(body, 'latin1') : body;
  return Buffer.concat([Buffer.from('TZif2\x00header\n', 'latin1'), Buffer.from('\n'), bytes, Buffer.from('\n')]);
}

describe('posixTzFromIana (on-disk zoneinfo footer)', () => {
  it('reads the byte-exact DST footer for America/Chicago', () => {
    expect(posixTzFromIana('America/Chicago')).toEqual({ ok: true, posix: 'CST6CDT,M3.2.0,M11.1.0' });
  });

  it('reads the byte-exact DST footer for Europe/London', () => {
    expect(posixTzFromIana('Europe/London')).toEqual({ ok: true, posix: 'GMT0BST,M3.5.0/1,M10.5.0' });
  });

  it('reads a fixed-offset Etc zone footer', () => {
    // Etc/GMT-5 is UTC+5 with no DST; glibc emits it as the numeric `<+05>-5` form.
    expect(posixTzFromIana('Etc/GMT-5')).toEqual({ ok: true, posix: '<+05>-5' });
  });

  it('rejects a bogus zone name before touching the filesystem', () => {
    const reader = vi.fn<ZoneinfoReader>();
    const res = posixTzFromIana('Not/AZone', reader);
    expect(res).toEqual({ ok: false, reason: 'invalid-zone' });
    expect(reader).not.toHaveBeenCalled();
  });

  it('rejects path-traversal input without reading outside zoneinfo', () => {
    const reader = vi.fn<ZoneinfoReader>();
    const res = posixTzFromIana('../../etc/passwd', reader);
    expect(res.ok).toBe(false);
    expect(reader).not.toHaveBeenCalled();
  });

  it('rejects a synthetic over-length footer via the injected reader', () => {
    const reader: ZoneinfoReader = () => footerFile('X'.repeat(64));
    expect(posixTzFromIana('America/Chicago', reader)).toEqual({ ok: false, reason: 'too-long' });
  });

  it('rejects a synthetic NUL-bearing footer via the injected reader', () => {
    const reader: ZoneinfoReader = () => footerFile(Buffer.from('CST6\x00CDT', 'latin1'));
    expect(posixTzFromIana('America/Chicago', reader)).toEqual({ ok: false, reason: 'nul-byte' });
  });

  it('rejects a v1-only file with no trailing-newline footer', () => {
    const reader: ZoneinfoReader = () => Buffer.from('TZif\x00...binary-no-footer', 'latin1');
    expect(posixTzFromIana('America/Chicago', reader)).toEqual({ ok: false, reason: 'no-footer' });
  });

  it('maps a filesystem read error (ENOENT) to a distinct reason', () => {
    const reader: ZoneinfoReader = () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    };
    expect(posixTzFromIana('Etc/UTC', reader)).toEqual({ ok: false, reason: 'read-failed' });
  });
});
