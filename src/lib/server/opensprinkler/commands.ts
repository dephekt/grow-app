/**
 * OpenSprinkler MQTT command strings. OS parses commands from its Subscribe Topic
 * as HTTP-API query strings, dispatching on the first two chars: `cm`=manual run,
 * `cv`=change values (stop). `findKeyVal()` reads `sid`/`t`/`en`/`rsn` regardless of
 * the `?`/`&` separators. No `pw` — "Ignore Password" is enabled on the device.
 *
 * Verified live (spike): publishing `cm?sid=0&t=5&en=1` to `<base>/cmd` runs station 0
 * for 5 s (`os/station/0 {"state":1}` → `{"state":0}`).
 */

/** Run station `sid` (0-based) for `seconds`, then OS auto-stops. */
export function buildRunCommand(sid: number, seconds: number): string {
  return `cm?sid=${sid}&t=${seconds}&en=1`;
}

/** Stop a single station immediately. */
export function buildStopCommand(sid: number): string {
  return `cm?sid=${sid}&en=0`;
}
