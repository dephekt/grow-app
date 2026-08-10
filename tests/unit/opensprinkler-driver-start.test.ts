// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrokerSnapshot, SnapshotEvent } from '../../src/lib/server/mqtt/types';
import type { Zone } from '../../src/lib/server/opensprinkler/zones';

/** Typed, not cast, so a new required field on either shape fails here rather than letting
 *  the fixture drift away from what the driver is actually handed at runtime. */
const broker: BrokerSnapshot = {
  connected: false,
  connecting: false,
  error: null,
  lastConnectedAt: null,
  lastMessageAt: null
};

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

const published: Array<[topic: string, payload: string]> = [];
/** Every listener handed to subscribe(), so a repeat start's extra subscription is visible. */
const subscribers: Array<(event: SnapshotEvent) => void> = [];

vi.mock('$lib/server/mqtt/service', () => ({
  getSiteMqttService: () => ({
    brokerConnected: () => broker.connected,
    subscribe: (fn: (event: SnapshotEvent) => void) => {
      subscribers.push(fn);
      return () => {};
    },
    // Mirrors the real one: a publish while the client is still dialling rejects.
    publishOsDiscovery: async (topic: string, payload: string) => {
      if (!broker.connected) throw new Error('Broker is not connected');
      published.push([topic, payload]);
    },
    publishOsCommand: async () => {},
    entityState: () => ({ value: null, updatedAt: null })
  })
}));

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
  const { startOpenSprinklerDriver } = await import('../../src/lib/server/opensprinkler/controller');
  startOpenSprinklerDriver();
};

const emitBrokerEvent = (): void => {
  for (const listener of [...subscribers]) listener({ type: 'broker', broker });
};

/** Let the `void`-ed publish promise and its .catch settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const stubConsoleError = () => vi.spyOn(console, 'error').mockImplementation(() => {});
let errors: ReturnType<typeof stubConsoleError>;

beforeEach(() => {
  vi.resetModules();
  broker.connected = false;
  published.length = 0;
  subscribers.length = 0;
  // Installed per test rather than inline, so a failed assertion can't leave console.error
  // stubbed for every test that follows.
  errors = stubConsoleError();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('startOpenSprinklerDriver', () => {
  it('publishes nothing at a cold start, then publishes once the broker connects', async () => {
    await startDriver();
    await settle();

    // The whole point: no publish attempt, so no "Broker is not connected" stack trace
    // on a boot where nothing is actually wrong.
    expect(published).toEqual([]);
    expect(errors).not.toHaveBeenCalled();

    broker.connected = true;
    emitBrokerEvent();
    await settle();

    expect(published).toEqual(DISCOVERY);
    expect(errors).not.toHaveBeenCalled();
  });

  it('still publishes immediately when the broker connected before we subscribed', async () => {
    broker.connected = true;
    await startDriver();
    await settle();

    // That connect event has already fired and will not fire again, so this call is the
    // only thing that publishes discovery — the reason it is not simply deleted.
    expect(published).toEqual(DISCOVERY);
    expect(errors).not.toHaveBeenCalled();
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
  });
});
