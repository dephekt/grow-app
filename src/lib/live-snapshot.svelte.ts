import type { BrokerSnapshot, EntityConfig, EntityState, FirmwareSnapshot, Snapshot, SnapshotEvent } from '$lib/server/mqtt/types';
import { formatEntityState } from '$lib/state-format';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clonePlain<T>(value: T): T {
  return structuredClone($state.snapshot(value) as T);
}

function recordOr<T>(value: unknown, fallback: Record<string, T>): Record<string, T> {
  return isRecord(value) ? (clonePlain(value) as Record<string, T>) : clonePlain(fallback);
}

function brokerOr(value: unknown, fallback?: BrokerSnapshot): BrokerSnapshot {
  const fallbackBroker = clonePlain(
    fallback ?? {
      connected: false,
      connecting: false,
      error: null,
      lastConnectedAt: null,
      lastMessageAt: null
    }
  );
  if (!isRecord(value)) return fallbackBroker;

  return {
    connected: typeof value.connected === 'boolean' ? value.connected : fallbackBroker.connected,
    connecting: typeof value.connecting === 'boolean' ? value.connecting : fallbackBroker.connecting,
    error: typeof value.error === 'string' || value.error === null ? value.error : fallbackBroker.error,
    lastConnectedAt:
      typeof value.lastConnectedAt === 'string' || value.lastConnectedAt === null ? value.lastConnectedAt : fallbackBroker.lastConnectedAt,
    lastMessageAt: typeof value.lastMessageAt === 'string' || value.lastMessageAt === null ? value.lastMessageAt : fallbackBroker.lastMessageAt
  };
}

function firmwareOr(value: unknown, fallback?: FirmwareSnapshot): FirmwareSnapshot {
  const fallbackFirmware = clonePlain(
    fallback ?? {
      devices: {},
      channels: {}
    }
  );
  if (!isRecord(value)) return fallbackFirmware;

  return {
    devices: recordOr(value.devices, fallbackFirmware.devices),
    channels: recordOr(value.channels, fallbackFirmware.channels)
  };
}

export function normalizeSnapshot(value: unknown, fallback?: Snapshot): Snapshot {
  const raw = isRecord(value) ? value : {};
  return {
    site: typeof raw.site === 'string' ? raw.site : fallback?.site ?? 'grow',
    topicPrefix: typeof raw.topicPrefix === 'string' ? raw.topicPrefix : fallback?.topicPrefix ?? '',
    discoveryPrefix: typeof raw.discoveryPrefix === 'string' ? raw.discoveryPrefix : fallback?.discoveryPrefix ?? '',
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : fallback?.generatedAt ?? new Date().toISOString(),
    broker: brokerOr(raw.broker, fallback?.broker),
    devices: Array.isArray(raw.devices) ? clonePlain(raw.devices) : clonePlain(fallback?.devices ?? []),
    entities: Array.isArray(raw.entities) ? clonePlain(raw.entities) : clonePlain(fallback?.entities ?? []),
    states: recordOr(raw.states, fallback?.states ?? {}),
    uiConfigs: recordOr(raw.uiConfigs, fallback?.uiConfigs ?? {}),
    firmware: firmwareOr(raw.firmware, fallback?.firmware)
  };
}

export function createLiveSnapshot(initialSnapshot: Snapshot | null | undefined) {
  let snapshot = $state<Snapshot>(normalizeSnapshot(initialSnapshot));
  let error = $state<string | null>(null);
  let commandPending = $state<Record<string, boolean>>({});
  let commandErrors = $state<Record<string, string>>({});

  function connect(): () => void {
    const events = new EventSource('/api/events');

    events.addEventListener('snapshot', (event) => {
      snapshot = normalizeSnapshot(JSON.parse((event as MessageEvent).data), snapshot);
      error = null;
    });

    events.addEventListener('entity', (event) => {
      const update = JSON.parse((event as MessageEvent).data) as SnapshotEvent;
      if (!update.entity) return;
      snapshot = {
        ...snapshot,
        entities: [...snapshot.entities.filter((entity) => entity.id !== update.entity?.id), update.entity]
      };
    });

    events.addEventListener('state', (event) => {
      const update = JSON.parse((event as MessageEvent).data) as SnapshotEvent;
      if (!update.entityId || !update.state) return;
      snapshot = {
        ...snapshot,
        states: {
          ...snapshot.states,
          [update.entityId]: update.state
        },
        broker: { ...snapshot.broker, lastMessageAt: update.state.updatedAt }
      };
    });

    events.addEventListener('availability', (event) => {
      const update = JSON.parse((event as MessageEvent).data) as SnapshotEvent;
      if (!update.deviceId || !update.availability) return;
      snapshot = {
        ...snapshot,
        devices: snapshot.devices.map((device) =>
          device.id === update.deviceId ? { ...device, availability: update.availability ?? 'unknown' } : device
        )
      };
    });

    events.addEventListener('broker', (event) => {
      const update = JSON.parse((event as MessageEvent).data) as SnapshotEvent;
      if (!update.broker) return;
      snapshot = { ...snapshot, broker: update.broker };
    });

    events.addEventListener('firmware', (event) => {
      const update = JSON.parse((event as MessageEvent).data) as SnapshotEvent;
      if (!update.firmware) return;
      snapshot = { ...snapshot, firmware: update.firmware };
    });

    events.onerror = () => {
      error = 'Live event stream disconnected';
      // The SSE endpoint is session-guarded: a mid-stream 401 means the session
      // expired or was revoked. Re-probe /api/me and, if we're now anonymous,
      // bounce to the login screen. A transient network drop keeps user set, so
      // this doesn't fire on ordinary reconnect churn.
      if (typeof window === 'undefined') return;
      void fetch('/api/me')
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { user?: unknown } | null) => {
          if (body && body.user === null) {
            const next = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = `/login?next=${next}`;
          }
        })
        .catch(() => {
          /* offline — leave the stale-data banner up, don't force a redirect */
        });
    };

    return () => events.close();
  }

  function stateFor(entity: EntityConfig): EntityState {
    return snapshot.states[entity.id] ?? { value: null, updatedAt: null };
  }

  function formatState(entity: EntityConfig): string {
    return formatEntityState(entity, stateFor(entity));
  }

  /** Resolves true only when the command was actually published successfully —
   *  false on a cancelled dangerous-confirm or any error. Callers that gate state
   *  on success (e.g. calibration marking a step done) must use the return value,
   *  not the absence of an error (the cancel path records no error). */
  async function sendCommand(entity: EntityConfig, value?: unknown): Promise<boolean> {
    if (entity.dangerous && !confirm(`Publish command for ${entity.name}?`)) return false;

    commandPending = { ...commandPending, [entity.id]: true };
    commandErrors = { ...commandErrors, [entity.id]: '' };

    try {
      const response = await fetch(`/api/entities/${entity.id}/command`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value, confirm: entity.dangerous })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        commandErrors = { ...commandErrors, [entity.id]: body.error ?? 'Command failed' };
        return false;
      }
      return true;
    } catch {
      commandErrors = { ...commandErrors, [entity.id]: 'Command failed' };
      return false;
    } finally {
      commandPending = { ...commandPending, [entity.id]: false };
    }
  }

  /** Run an irrigation zone as a shot. Pending/error are tracked under a
   *  `zone:<id>` key so they never collide with entity-id command state. */
  async function runZoneShot(zoneId: string, shot: { seconds?: number; ml?: number; percent?: number }): Promise<boolean> {
    const key = `zone:${zoneId}`;
    commandPending = { ...commandPending, [key]: true };
    commandErrors = { ...commandErrors, [key]: '' };
    try {
      const response = await fetch(`/api/irrigation/zones/${zoneId}/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(shot)
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        commandErrors = { ...commandErrors, [key]: body.error ?? 'Run failed' };
        return false;
      }
      return true;
    } catch {
      commandErrors = { ...commandErrors, [key]: 'Run failed' };
      return false;
    } finally {
      commandPending = { ...commandPending, [key]: false };
    }
  }

  async function stopZone(zoneId: string): Promise<boolean> {
    const key = `zone:${zoneId}`;
    commandPending = { ...commandPending, [key]: true };
    commandErrors = { ...commandErrors, [key]: '' };
    try {
      const response = await fetch(`/api/irrigation/zones/${zoneId}/stop`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        commandErrors = { ...commandErrors, [key]: body.error ?? 'Stop failed' };
        return false;
      }
      return true;
    } catch {
      commandErrors = { ...commandErrors, [key]: 'Stop failed' };
      return false;
    } finally {
      commandPending = { ...commandPending, [key]: false };
    }
  }

  return {
    get snapshot() {
      return snapshot;
    },
    get error() {
      return error;
    },
    get commandPending() {
      return commandPending;
    },
    get commandErrors() {
      return commandErrors;
    },
    connect,
    stateFor,
    formatState,
    sendCommand,
    runZoneShot,
    stopZone
  };
}
