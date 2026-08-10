// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotEvent } from '../../src/lib/server/mqtt/types';

const broker = { connected: false };
const published: Array<[topic: string, payload: string]> = [];
let subscriber: ((event: SnapshotEvent) => void) | null = null;

vi.mock('$lib/server/mqtt/service', () => ({
  getSiteMqttService: () => ({
    brokerConnected: () => broker.connected,
    subscribe: (fn: (event: SnapshotEvent) => void) => {
      subscriber = fn;
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

vi.mock('$lib/server/opensprinkler/zones', () => ({
  listZones: () => [{ id: 'z1', name: '4x4', stationSid: 1 }]
}));

import { startOpenSprinklerDriver } from '../../src/lib/server/opensprinkler/controller';
import { buildStationDiscovery } from '../../src/lib/server/opensprinkler/discovery';

/** Derived, not spelled out, so a discovery-topic or payload change fails on its own test —
 *  what this one pins is that the mocked zone's name and sid reach the builder intact. */
const built = buildStationDiscovery({ discoveryPrefix: 'homeassistant', baseTopic: 'grow/test/os', sid: 1, name: '4x4' });
const DISCOVERY: Array<[string, string]> = [[built.topic, JSON.stringify(built.payload)]];

/** Let the `void`-ed publish promise and its .catch settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const stubConsoleError = () => vi.spyOn(console, 'error').mockImplementation(() => {});
let errors: ReturnType<typeof stubConsoleError>;

beforeEach(() => {
  broker.connected = false;
  published.length = 0;
  subscriber = null;
  // Installed per test rather than inline, so a failed assertion can't leave console.error
  // stubbed for every test that follows.
  errors = stubConsoleError();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('startOpenSprinklerDriver', () => {
  it('publishes nothing at a cold start, then publishes once the broker connects', async () => {
    startOpenSprinklerDriver();
    await settle();

    // The whole point: no publish attempt, so no "Broker is not connected" stack trace
    // on a boot where nothing is actually wrong.
    expect(published).toEqual([]);
    expect(errors).not.toHaveBeenCalled();

    broker.connected = true;
    subscriber?.({ type: 'broker', broker } as SnapshotEvent);
    await settle();

    expect(published).toEqual(DISCOVERY);
    expect(errors).not.toHaveBeenCalled();
  });

  it('still publishes immediately when the broker connected before we subscribed', async () => {
    broker.connected = true;
    startOpenSprinklerDriver();
    await settle();

    // That connect event has already fired and will not fire again, so this call is the
    // only thing that publishes discovery — the reason it is not simply deleted.
    expect(published).toEqual(DISCOVERY);
    expect(errors).not.toHaveBeenCalled();
  });
});
