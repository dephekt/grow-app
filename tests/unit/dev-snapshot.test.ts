import { describe, expect, it } from 'vitest';
import { devSnapshotCommandResult, loadDevSnapshot, type DevSnapshotConfig } from '../../src/lib/server/dev-snapshot';
import type { Snapshot } from '../../src/lib/server/mqtt/types';

const snapshot = {
  site: 'daniel-home',
  topicPrefix: 'grow/daniel-home',
  discoveryPrefix: 'grow/daniel-home/_discovery',
  generatedAt: '2026-06-30T10:00:00.000Z',
  broker: {
    connected: true,
    connecting: false,
    error: null,
    lastConnectedAt: '2026-06-30T09:59:00.000Z',
    lastMessageAt: '2026-06-30T09:59:30.000Z'
  },
  devices: [
    {
      id: 'atoms3u-sensor-rig',
      nodeId: 'atoms3u-sensor-rig',
      name: 'AtomS3U Sensor Rig',
      availability: 'online',
      entityIds: ['co2_high_threshold']
    }
  ],
  entities: [
    {
      id: 'co2_high_threshold',
      component: 'number',
      name: 'CO2 High Threshold',
      uniqueId: 'co2_high_threshold',
      objectId: 'co2_high_threshold',
      nodeId: 'atoms3u-sensor-rig',
      device: { identifiers: ['atoms3u-sensor-rig'], name: 'AtomS3U Sensor Rig' },
      commandTopic: 'grow/daniel-home/atoms3u-sensor-rig/number/co2_high_threshold/command',
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      min: 500,
      max: 2000,
      step: 50,
      dangerous: false,
      writable: true,
      raw: {}
    }
  ],
  states: { co2_high_threshold: { value: '1500', updatedAt: '2026-06-30T09:59:30.000Z' } },
  uiConfigs: {},
  lights: [],
  firmware: { devices: {}, channels: {} }
} satisfies Snapshot;

const config = {
  enabled: true,
  url: 'http://live.test/api/snapshot',
  commands: 'mock'
} satisfies DevSnapshotConfig;

function fetchSnapshot(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    })) as typeof fetch;
}

describe('dev snapshot simulation', () => {
  it('loads a snapshot from the configured URL', async () => {
    const loaded = await loadDevSnapshot(config, fetchSnapshot(snapshot));

    expect(loaded?.devices).toHaveLength(1);
    expect(loaded?.entities[0]?.id).toBe('co2_high_threshold');
  });

  it('mocks valid entity commands against the snapshot metadata', async () => {
    const result = await devSnapshotCommandResult('co2_high_threshold', { value: 1650 }, config, fetchSnapshot(snapshot));

    expect(result).toEqual({
      status: 200,
      body: { ok: true, simulated: true }
    });
  });

  it('returns command validation errors without publishing', async () => {
    const result = await devSnapshotCommandResult('co2_high_threshold', { value: 2500 }, config, fetchSnapshot(snapshot));

    expect(result).toEqual({
      status: 400,
      body: { ok: false, error: 'Value must be <= 2000' }
    });
  });

  it('loadDevSnapshot returns null when HTTP response is not ok', async () => {
    const loaded = await loadDevSnapshot(config, fetchSnapshot(snapshot, 500));
    expect(loaded).toBeNull();
  });

  it('loadDevSnapshot returns null when fetch throws', async () => {
    const throwingFetch = (async () => { throw new Error('network'); }) as typeof fetch;
    const loaded = await loadDevSnapshot(config, throwingFetch);
    expect(loaded).toBeNull();
  });

  it('loadDevSnapshot returns null when payload is not a valid Snapshot shape', async () => {
    const loaded = await loadDevSnapshot(config, fetchSnapshot({ not: 'a snapshot' }));
    expect(loaded).toBeNull();
  });

  it('loadDevSnapshot returns null when config.enabled is false', async () => {
    const loaded = await loadDevSnapshot({ ...config, enabled: false }, fetchSnapshot(snapshot));
    expect(loaded).toBeNull();
  });

  it('devSnapshotCommandResult returns 404 for an unknown entity', async () => {
    const result = await devSnapshotCommandResult('does_not_exist', { value: 1000 }, config, fetchSnapshot(snapshot));
    expect(result).toEqual({
      status: 404,
      body: { ok: false, error: 'Unknown entity' }
    });
  });

  it('devSnapshotCommandResult returns 503 when snapshot cannot be loaded', async () => {
    const result = await devSnapshotCommandResult('co2_high_threshold', { value: 1000 }, config, fetchSnapshot(snapshot, 500));
    expect(result).toEqual({
      status: 503,
      body: { ok: false, error: 'Dev snapshot is unavailable' }
    });
  });

  it('devSnapshotCommandResult returns null when config.commands is publish', async () => {
    const result = await devSnapshotCommandResult('co2_high_threshold', { value: 1000 }, { ...config, commands: 'publish' }, fetchSnapshot(snapshot));
    expect(result).toBeNull();
  });
});
