// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrokerSnapshot, SnapshotEvent } from '../../src/lib/server/mqtt/types';
import { settle, ZONE } from './fixtures';

/** Typed, not cast, so a new required field on BrokerSnapshot fails here rather than letting
 *  the fixture drift away from what the driver is actually handed at runtime. (The zone
 *  fixture earns the same guarantee from ./fixtures, which both driver tests now share.) */
const broker: BrokerSnapshot = {
  connected: false,
  connecting: false,
  error: null,
  lastConnectedAt: null,
  lastMessageAt: null
};

const published: Array<[topic: string, payload: string]> = [];
/** Every listener handed to subscribe(), so a repeat start's extra subscription is visible. */
const subscribers: Array<(event: SnapshotEvent) => void> = [];

// The real BrokerNotConnectedError is kept, not redeclared: the controller resolves that
// class through THIS mock, so its `instanceof` check and the rejection below have to be the
// same class or the classification silently never matches.
vi.mock('$lib/server/mqtt/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/server/mqtt/service')>();
  return {
    BrokerNotConnectedError: actual.BrokerNotConnectedError,
    getSiteMqttService: () => ({
      brokerConnected: () => broker.connected,
      subscribe: (fn: (event: SnapshotEvent) => void) => {
        subscribers.push(fn);
        return () => {};
      },
      // Mirrors the real one: a publish while the client is still dialling rejects with the
      // sentinel, NOT a bare Error. Getting this wrong would make the assertions below pass
      // for the wrong reason — a bare Error is reported through console.error, so a deleted
      // brokerConnected() guard would still be caught by the error spy alone.
      publishOsDiscovery: async (topic: string, payload: string) => {
        if (!broker.connected) throw new actual.BrokerNotConnectedError();
        published.push([topic, payload]);
      },
      publishOsCommand: async () => {},
      entityState: () => ({ value: null, updatedAt: null })
    })
  };
});

vi.mock('$lib/server/opensprinkler/config', () => ({
  getOpenSprinklerConfig: () => ({
    enabled: true,
    baseTopic: 'grow/test/os',
    discoveryPrefix: 'homeassistant'
  })
}));

vi.mock('$lib/server/opensprinkler/db', () => ({ getIrrigationDb: () => ({}) }));

vi.mock('$lib/server/opensprinkler/zones', () => ({ listZones: () => [ZONE] }));

import { buildStationDiscovery } from '../../src/lib/server/opensprinkler/discovery';

/** Derived, not spelled out, so a discovery-topic or payload change fails on its own test —
 *  what this one pins is that the fixture zone's name and sid reach the builder intact. */
const built = buildStationDiscovery({
  discoveryPrefix: 'homeassistant',
  baseTopic: 'grow/test/os',
  sid: ZONE.stationSid,
  name: ZONE.name
});
const DISCOVERY: Array<[string, string]> = [[built.topic, JSON.stringify(built.payload)]];

/** Imported per call rather than once at the top: the controller module holds BOTH the
 *  IrrigationController singleton and the driver's started flag, so a test that shared them
 *  would assert through the previous test's controller instance. beforeEach resets the
 *  registry; calling this twice without a reset exercises the idempotence guard. */
const startDriver = async (): Promise<void> => {
  const { startOpenSprinklerDriver } =
    await import('../../src/lib/server/opensprinkler/controller');
  startOpenSprinklerDriver();
};

const emitBrokerEvent = (): void => {
  for (const listener of [...subscribers]) listener({ type: 'broker', broker });
};

const stubConsoleError = () => vi.spyOn(console, 'error').mockImplementation(() => {});
let errors: ReturnType<typeof stubConsoleError>;
/** Watched alongside errors: a skipped publish is now reported at warn, so asserting only on
 *  console.error would let a deleted brokerConnected() guard through silently. */
let warnings: ReturnType<typeof stubConsoleError>;

beforeEach(() => {
  vi.resetModules();
  broker.connected = false;
  published.length = 0;
  subscribers.length = 0;
  // Installed per test rather than inline, so a failed assertion can't leave console.error
  // stubbed for every test that follows.
  errors = stubConsoleError();
  warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('startOpenSprinklerDriver', () => {
  it('publishes nothing at a cold start, then publishes once the broker connects', async () => {
    await startDriver();
    await settle();

    // The whole point: no publish attempt, so not a word about the broker on a boot where
    // nothing is actually wrong. Both levels are asserted — the skipped-publish report is a
    // warn now, so console.error alone would no longer notice the guard going missing.
    expect(published).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();

    broker.connected = true;
    emitBrokerEvent();
    await settle();

    expect(published).toEqual(DISCOVERY);
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });

  it('still publishes immediately when the broker connected before we subscribed', async () => {
    broker.connected = true;
    await startDriver();
    await settle();

    // That connect event has already fired and will not fire again, so this call is the
    // only thing that publishes discovery — the reason it is not simply deleted.
    expect(published).toEqual(DISCOVERY);
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });

  it('is idempotent: a second start adds no second subscription and no duplicate publish', async () => {
    broker.connected = true;
    await startDriver();
    await startDriver();
    await settle();

    // Without the guard this is two listeners on the shared emitter — every reconnect
    // republishing discovery twice, and MaxListenersExceededWarning once ten pile up.
    expect(subscribers).toHaveLength(1);
    expect(published).toEqual(DISCOVERY);

    emitBrokerEvent();
    await settle();

    expect(published).toEqual([...DISCOVERY, ...DISCOVERY]);
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });
});
