// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IrrigationController } from '../../src/lib/server/opensprinkler/controller';
import { stationEntityId } from '../../src/lib/server/opensprinkler/discovery';
import { BrokerNotConnectedError, type SiteMqttService } from '../../src/lib/server/mqtt/service';
import type { OpenSprinklerConfig } from '../../src/lib/server/opensprinkler/config';
import type { EntityState } from '../../src/lib/server/mqtt/types';
import type { Zone } from '../../src/lib/server/opensprinkler/zones';

const config: OpenSprinklerConfig = { enabled: true, baseTopic: 'grow/test/os', discoveryPrefix: 'homeassistant' };

// A minimal SiteMqttService stub: enough for runStation (publish) + isStationRunning
// (entityState). entityState mirrors the real one's null-guard for a missing entity.
function makeController(states: Record<string, EntityState> = {}) {
  const service = {
    publishOsCommand: async () => {},
    entityState: (id: string): EntityState => states[id] ?? { value: null, updatedAt: null }
  } as unknown as SiteMqttService;
  return new IrrigationController(service, config);
}

describe('IrrigationController.isStationRunning', () => {
  it('is true while our own watchdog is armed (we just started a run)', async () => {
    const controller = makeController();
    await controller.runStation(2, 30); // arms the watchdog
    expect(controller.isStationRunning(2)).toBe(true);
    controller.noteStationState(2, false); // clear the armed watchdog timer
  });

  it("is true when the live entity state reads 'ON'", () => {
    const controller = makeController({ [stationEntityId(3)]: { value: 'ON', updatedAt: null } });
    expect(controller.isStationRunning(3)).toBe(true);
  });

  it('is false for an undiscovered station (entityState value null)', () => {
    const controller = makeController();
    expect(controller.isStationRunning(5)).toBe(false);
  });
});

const ZONE: Zone = {
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

/** A controller whose retained publishes always reject with `rejection`. */
function makeFailingController(rejection: Error) {
  const service = {
    publishOsCommand: async () => {},
    publishOsDiscovery: async () => {
      throw rejection;
    },
    entityState: (): EntityState => ({ value: null, updatedAt: null })
  } as unknown as SiteMqttService;
  return new IrrigationController(service, config);
}

/** Let the `void`-ed publish promise and its .catch settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('background publish failures are classified, not blanket-errored', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns without a stack trace when discovery is skipped for a disconnected broker', async () => {
    makeFailingController(new BrokerNotConnectedError()).publishZoneDiscovery(ZONE);
    await settle();

    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    // The recovery clause is the point of the line: it says the work is not lost.
    expect(warn.mock.calls[0][0]).toContain('republished on the next connect');
  });

  it('still errors, with the original, on a real publish fault', async () => {
    const fault = new Error('client.publish exploded');
    makeFailingController(fault).publishZoneDiscovery(ZONE);
    await settle();

    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('discovery publish failed'), fault);
  });

  it('tells the truth about a skipped retract, which nothing reissues', async () => {
    makeFailingController(new BrokerNotConnectedError()).retractStation(1);
    await settle();

    expect(error).not.toHaveBeenCalled();
    // Two topics are retracted per station: the discovery config and the normalized state.
    expect(warn).toHaveBeenCalledTimes(2);
    // Deliberately NOT the discovery path's "republished on the next connect" — no later pass
    // clears a retained config for a station that no longer exists.
    expect(warn.mock.calls[0][0]).toContain('until it is retracted again');
  });
});
