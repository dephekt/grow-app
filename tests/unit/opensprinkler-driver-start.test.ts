// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotEvent } from '../../src/lib/server/mqtt/types';

const broker = { connected: false };
const published: string[] = [];
let subscriber: ((event: SnapshotEvent) => void) | null = null;

vi.mock('$lib/server/mqtt/service', () => ({
  getSiteMqttService: () => ({
    snapshot: () => ({ broker }),
    subscribe: (fn: (event: SnapshotEvent) => void) => {
      subscriber = fn;
      return () => {};
    },
    // Mirrors the real one: a publish while the client is still dialling rejects.
    publishOsDiscovery: async (topic: string) => {
      if (!broker.connected) throw new Error('Broker is not connected');
      published.push(topic);
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
import { stationDiscoveryTopic } from '../../src/lib/server/opensprinkler/discovery';

/** Derived, not spelled out, so a discovery-topic change fails on its own test. */
const TOPIC = stationDiscoveryTopic('homeassistant', 1);

/** Let the `void`-ed publish promise and its .catch settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  broker.connected = false;
  published.length = 0;
  subscriber = null;
});

describe('startOpenSprinklerDriver', () => {
  it('publishes nothing at a cold start, then publishes once the broker connects', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    startOpenSprinklerDriver();
    await settle();

    // The whole point: no publish attempt, so no "Broker is not connected" stack trace
    // on a boot where nothing is actually wrong.
    expect(published).toEqual([]);
    expect(errors).not.toHaveBeenCalled();

    broker.connected = true;
    subscriber?.({ type: 'broker', broker } as SnapshotEvent);
    await settle();

    expect(published).toEqual([TOPIC]);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('still publishes immediately when the broker connected before we subscribed', async () => {
    broker.connected = true;
    startOpenSprinklerDriver();
    await settle();

    // That connect event has already fired and will not fire again, so this call is the
    // only thing that publishes discovery — the reason it is not simply deleted.
    expect(published).toEqual([TOPIC]);
  });
});
