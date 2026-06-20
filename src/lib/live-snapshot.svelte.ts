import type { EntityConfig, EntityState, Snapshot, SnapshotEvent } from '$lib/server/mqtt/types';
import { formatEntityState } from '$lib/state-format';

function cloneSnapshot(value: Snapshot): Snapshot {
  return structuredClone(value);
}

export function createLiveSnapshot(initialSnapshot: Snapshot) {
  let snapshot = $state<Snapshot>(cloneSnapshot(initialSnapshot));
  let error = $state<string | null>(null);
  let commandPending = $state<Record<string, boolean>>({});
  let commandErrors = $state<Record<string, string>>({});

  function connect(): () => void {
    const events = new EventSource('/api/events');

    events.addEventListener('snapshot', (event) => {
      snapshot = JSON.parse((event as MessageEvent).data) as Snapshot;
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

    events.onerror = () => {
      error = 'Live event stream disconnected';
    };

    return () => events.close();
  }

  function stateFor(entity: EntityConfig): EntityState {
    return snapshot.states[entity.id] ?? { value: null, updatedAt: null };
  }

  function formatState(entity: EntityConfig): string {
    return formatEntityState(entity, stateFor(entity));
  }

  async function sendCommand(entity: EntityConfig, value?: unknown) {
    if (entity.dangerous && !confirm(`Publish command for ${entity.name}?`)) return;

    commandPending = { ...commandPending, [entity.id]: true };
    commandErrors = { ...commandErrors, [entity.id]: '' };

    const response = await fetch(`/api/entities/${entity.id}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value, confirm: entity.dangerous })
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      commandErrors = { ...commandErrors, [entity.id]: body.error ?? 'Command failed' };
    }

    commandPending = { ...commandPending, [entity.id]: false };
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
    sendCommand
  };
}
