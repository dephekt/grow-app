// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * OpenSprinkler parses commands from its Subscribe Topic as HTTP-API query strings,
 * dispatching on the first two chars: `cm`=manual run, `cv`=change values (stop).
 * No `pw` — "Ignore Password" is enabled on the device.
 */

/** Run station `sid` (0-based) for `seconds`, then OS auto-stops. */
export function buildRunCommand(sid: number, seconds: number): string {
  return `cm?sid=${sid}&t=${seconds}&en=1`;
}

/** Stop a single station immediately. */
export function buildStopCommand(sid: number): string {
  return `cm?sid=${sid}&en=0`;
}
