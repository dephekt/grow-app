import { describe, expect, it } from 'vitest';
import { normalizeSnapshot } from '../../src/lib/live-snapshot.svelte';
import type { Snapshot } from '../../src/lib/server/mqtt/types';

const fallbackSnapshot = {
  site: 'daniel-home',
  topicPrefix: 'grow/daniel-home',
  discoveryPrefix: 'grow/daniel-home/_discovery',
  generatedAt: '2026-06-21T18:00:00.000Z',
  broker: {
    connected: true,
    connecting: false,
    error: null,
    lastConnectedAt: '2026-06-21T17:59:00.000Z',
    lastMessageAt: '2026-06-21T17:59:30.000Z'
  },
  devices: [
    {
      id: 'atoms3u-sensor-rig',
      nodeId: 'atoms3u-sensor-rig',
      name: 'AtomS3U Sensor Rig',
      availability: 'online',
      entityIds: ['firmware_update']
    }
  ],
  entities: [
    {
      id: 'firmware_update',
      component: 'update',
      name: 'Firmware Update',
      uniqueId: 'ESPupdatefirmware_update',
      nodeId: 'atoms3u-sensor-rig',
      device: { identifiers: ['atoms3u-sensor-rig'], name: 'AtomS3U Sensor Rig' },
      payloadAvailable: 'online',
      payloadNotAvailable: 'offline',
      dangerous: false,
      writable: true,
      raw: {}
    }
  ],
  states: { firmware_update: { value: null, updatedAt: null } },
  uiConfigs: {},
  lights: [],
  firmware: {
    devices: {
      'atoms3u-sensor-rig': {
        schema: 'grow-firmware-device.v1',
        nodeId: 'atoms3u-sensor-rig',
        projectName: 'stackdrift.atoms3u-sensor-rig',
        packageOwner: 'stackdrift-firmware',
        package: 'atoms3u-sensor-rig',
        device: 'atoms3u-sensor-rig',
        chipFamily: 'ESP32-S3'
      }
    },
    channels: {}
  }
} satisfies Snapshot;

describe('live snapshot normalization', () => {
  it('keeps array and map fields defined for incomplete full snapshot events', () => {
    const snapshot = normalizeSnapshot({ broker: { lastMessageAt: '2026-06-21T18:01:00.000Z' } }, fallbackSnapshot);

    expect(snapshot.devices).toHaveLength(1);
    expect(snapshot.entities).toHaveLength(1);
    expect(snapshot.states.firmware_update).toEqual({ value: null, updatedAt: null });
    expect(snapshot.firmware.devices['atoms3u-sensor-rig']?.projectName).toBe('stackdrift.atoms3u-sensor-rig');
    expect(snapshot.broker).toMatchObject({
      connected: true,
      lastMessageAt: '2026-06-21T18:01:00.000Z'
    });
  });

  it('returns empty collections when no fallback exists', () => {
    const snapshot = normalizeSnapshot({});

    expect(snapshot.devices).toEqual([]);
    expect(snapshot.entities).toEqual([]);
    expect(snapshot.states).toEqual({});
    expect(snapshot.uiConfigs).toEqual({});
    expect(snapshot.firmware).toEqual({ devices: {}, channels: {} });
  });
});
