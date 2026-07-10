/**
 * Whether the platform's `Intl` accepts `tz` as an IANA zone. Constructing a formatter
 * with a bad zone throws `RangeError` — which, if it reached tz math or the POSIX
 * converter, would 500 an API or feed a garbage path to the filesystem — so every tz
 * consumer probes the name here first. Extracted from `schedule-time.ts` so the
 * scheduler, the site-timezone resolver, and the POSIX converter share one guard
 * without an import cycle.
 */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
