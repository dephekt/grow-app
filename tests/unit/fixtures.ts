// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { Zone } from '../../src/lib/server/opensprinkler/zones';

/**
 * A single fully-populated zone, shared rather than copied per test file.
 *
 * Typed, not cast, so a new required field on `Zone` fails here — in ONE place — rather than
 * letting each copy drift away from what the controller is actually handed at runtime.
 */
export const ZONE: Zone = {
  id: 'z1',
  name: '4x4',
  stationSid: 1,
  substrateType: null,
  substrateVolumeMl: null,
  drippers: null,
  emitterLph: null,
  maxRunSeconds: 300,
  vwcMinPct: null,
  vwcMaxPct: null,
  substrateTempMinC: null,
  substrateTempMaxC: null,
  pwecMin: null,
  pwecMax: null,
  enabled: true,
  schedulesPaused: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

/** Let a `void`-ed publish promise and its .catch settle. */
export const settle = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, 0));
