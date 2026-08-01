// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteMqttService } from '../../src/lib/server/mqtt/service';
import type { LiveSpectrum } from '../../src/lib/server/mqtt/types';

const PREFIX = 'grow/daniel-home';
const T0 = 1_700_000_000_000;

type Publish = { topic: string; payload: string; resolve(): void; reject(): void };

/**
 * Drives the private publishDialSpectrum with a publishRaw whose promises are settled by hand, so
 * the ordering the review flagged can be reproduced deterministically.
 */
function dialService() {
  const service = new SiteMqttService({
    site: 'daniel-home',
    mqttUrl: 'mqtt://localhost:1883',
    topicPrefix: PREFIX,
    discoveryPrefix: `${PREFIX}/_discovery`
  });

  const publishes: Publish[] = [];
  const internals = service as unknown as {
    publishRaw(topic: string, payload: string, retain: boolean): Promise<void>;
    publishDialSpectrum(nodeId: string, live: LiveSpectrum | null): void;
    dialSpectrumOwner: string | null;
  };

  internals.publishRaw = (topic: string, payload: string) =>
    new Promise<void>((resolve, reject) => {
      publishes.push({ topic, payload, resolve: () => resolve(), reject: () => reject(new Error('publish failed')) });
    });

  const send = (nodeId: string, live: LiveSpectrum | null) => internals.publishDialSpectrum(nodeId, live);
  return { internals, publishes, send };
}

function frame(nodeId: string, seq: number): LiveSpectrum {
  return {
    nodeId,
    seq,
    integrationUs: 1000,
    saturated: false,
    adcBits: 12,
    fw: null,
    capturedAt: new Date(0).toISOString(),
    counts: [],
    processed: { relative: [], peakWavelengthNm: 660, saturated: false } as unknown as LiveSpectrum['processed']
  };
}

describe('publishDialSpectrum topic ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Not 0: lastDialSpectrumAt starts at 0, so an epoch clock sits inside the throttle window.
    vi.setSystemTime(T0);
  });

  it('keeps ownership consistent when a clear and a live publish settle out of order', async () => {
    const { internals, publishes, send } = dialService();

    send('spectrometer', frame('spectrometer', 1));
    expect(internals.dialSpectrumOwner).toBe('spectrometer');

    // Goes silent, then recovers before the blank publish has settled.
    send('spectrometer', null);
    vi.setSystemTime(T0 + 5_000);
    send('spectrometer', frame('spectrometer', 2));

    const [first, clear, live] = publishes;
    expect(clear.payload).toBe('');
    expect(live.payload).not.toBe('');

    // Settle the live publish first, then the older blank — the reordering the review described.
    live.resolve();
    clear.resolve();
    first.resolve();
    await vi.runAllTimersAsync();

    // A curve is retained, so the node must still own the topic; otherwise it can never clear it.
    expect(internals.dialSpectrumOwner).toBe('spectrometer');

    publishes.length = 0;
    send('spectrometer', null);
    expect(publishes.map((p) => p.payload)).toEqual(['']);
  });

  it('does not let a second node overwrite or clear the owner', async () => {
    const { internals, publishes, send } = dialService();

    send('spectrometer', frame('spectrometer', 1));
    publishes[0].resolve();
    await vi.runAllTimersAsync();
    publishes.length = 0;

    vi.setSystemTime(T0 + 5_000);
    send('spectrometer-2', frame('spectrometer-2', 1));
    expect(publishes).toHaveLength(0);

    send('spectrometer-2', null);
    expect(publishes).toHaveLength(0);
    expect(internals.dialSpectrumOwner).toBe('spectrometer');
  });

  it('restores ownership when the clear publish fails, so it can be retried', async () => {
    const { internals, publishes, send } = dialService();

    send('spectrometer', frame('spectrometer', 1));
    publishes[0].resolve();
    await vi.runAllTimersAsync();
    publishes.length = 0;

    send('spectrometer', null);
    publishes[0].reject();
    await vi.runAllTimersAsync();

    expect(internals.dialSpectrumOwner).toBe('spectrometer');

    publishes.length = 0;
    send('spectrometer', null);
    expect(publishes.map((p) => p.payload)).toEqual(['']);
  });

  it('releases the topic once the clear succeeds', async () => {
    const { internals, publishes, send } = dialService();

    send('spectrometer', frame('spectrometer', 1));
    publishes[0].resolve();
    await vi.runAllTimersAsync();
    publishes.length = 0;

    send('spectrometer', null);
    publishes[0].resolve();
    await vi.runAllTimersAsync();

    expect(internals.dialSpectrumOwner).toBeNull();

    publishes.length = 0;
    vi.setSystemTime(T0 + 5_000);
    send('spectrometer-2', frame('spectrometer-2', 1));
    expect(publishes).toHaveLength(1);
  });
});
