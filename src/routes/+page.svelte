<script lang="ts">
  import type { DeviceSnapshot, DeviceUiConfig, DeviceUiEntity, DeviceUiGroup, EntityConfig, EntityState, Snapshot, SnapshotEvent } from '$lib/server/mqtt/types';

  let { data } = $props<{ data: { snapshot: Snapshot } }>();

  function cloneSnapshot(value: Snapshot): Snapshot {
    return structuredClone(value);
  }

  // svelte-ignore state_referenced_locally
  let snapshot = $state<Snapshot>(cloneSnapshot(data.snapshot));
  let error = $state<string | null>(null);
  let commandPending = $state<Record<string, boolean>>({});
  let commandErrors = $state<Record<string, string>>({});

  let entitiesById = $derived(new Map(snapshot.entities.map((entity) => [entity.id, entity])));
  let writableCount = $derived(snapshot.entities.filter((entity) => entity.writable).length);
  let lastUpdate = $derived(snapshot.broker.lastMessageAt ?? snapshot.generatedAt);

  interface PresentedEntity {
    entity: EntityConfig;
    label: string;
    order: number;
    groupId?: string;
    role?: string;
  }

  interface PresentedSection {
    id: string;
    title: string;
    order: number;
    defaultOpen: boolean;
    entries: PresentedEntity[];
  }

  interface DevicePresentation {
    metrics: PresentedEntity[];
    sections: PresentedSection[];
  }

  $effect(() => {
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
  });

  function stateFor(entity: EntityConfig): EntityState {
    return snapshot.states[entity.id] ?? { value: null, updatedAt: null };
  }

  function formatState(entity: EntityConfig): string {
    const state = stateFor(entity).value;
    if (state === null || state === undefined || state === '') return 'No state yet';
    return entity.unit ? `${state} ${entity.unit}` : state;
  }

  function deviceEntities(device: DeviceSnapshot): EntityConfig[] {
    return device.entityIds
      .map((id) => entitiesById.get(id))
      .filter((entity): entity is EntityConfig => Boolean(entity))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function entityMatchKey(entity: EntityConfig): string {
    return `${entity.component}:${entity.objectId ?? entity.id}`;
  }

  function metadataByEntity(config: DeviceUiConfig | undefined): Map<string, DeviceUiEntity> {
    const metadata = new Map<string, DeviceUiEntity>();
    for (const entry of config?.entities ?? []) metadata.set(`${entry.component}:${entry.objectId}`, entry);
    return metadata;
  }

  function groupById(config: DeviceUiConfig | undefined): Map<string, DeviceUiGroup> {
    const groups = new Map<string, DeviceUiGroup>();
    for (const group of config?.groups ?? []) groups.set(group.id, group);
    return groups;
  }

  function toPresentedEntity(entity: EntityConfig, metadata?: DeviceUiEntity): PresentedEntity {
    return {
      entity,
      label: metadata?.label ?? entity.name,
      order: metadata?.order ?? 0,
      groupId: metadata?.group,
      role: metadata?.role
    };
  }

  function sortPresented(a: PresentedEntity, b: PresentedEntity): number {
    return a.order - b.order || a.label.localeCompare(b.label);
  }

  function isDiagnostic(entity: EntityConfig): boolean {
    return entity.entityCategory === 'diagnostic' || entity.objectId === 'uptime' || entity.objectId === 'wifi_signal';
  }

  function fallbackPresentation(entities: EntityConfig[]): DevicePresentation {
    const controls = entities.filter((entity) => entity.writable && !entity.dangerous).map((entity) => toPresentedEntity(entity));
    const readings = entities.filter((entity) => !entity.writable && !entity.dangerous && !isDiagnostic(entity)).map((entity) => toPresentedEntity(entity));
    const maintenance = entities.filter((entity) => entity.dangerous).map((entity) => toPresentedEntity(entity));
    const diagnostics = entities.filter((entity) => isDiagnostic(entity)).map((entity) => toPresentedEntity(entity));

    return {
      metrics: [],
      sections: [
        { id: 'controls', title: 'Controls', order: 10, defaultOpen: true, entries: controls.sort(sortPresented) },
        { id: 'readings', title: 'Readings', order: 20, defaultOpen: true, entries: readings.sort(sortPresented) },
        { id: 'maintenance', title: 'Maintenance', order: 80, defaultOpen: false, entries: maintenance.sort(sortPresented) },
        { id: 'diagnostics', title: 'Diagnostics', order: 90, defaultOpen: false, entries: diagnostics.sort(sortPresented) }
      ].filter((section) => section.entries.length > 0)
    };
  }

  function devicePresentation(device: DeviceSnapshot): DevicePresentation {
    const entities = deviceEntities(device);
    const config = snapshot.uiConfigs[device.nodeId];
    if (!config) return fallbackPresentation(entities);

    const entityMetadata = metadataByEntity(config);
    const groups = groupById(config);
    const consumed = new Set<string>();

    const metrics = entities
      .map((entity) => {
        const metadata = entityMetadata.get(entityMatchKey(entity));
        const group = metadata ? groups.get(metadata.group) : undefined;
        const metric = metadata?.role === 'metric' || group?.variant === 'metrics';
        return metadata && metric ? toPresentedEntity(entity, metadata) : null;
      })
      .filter((entry): entry is PresentedEntity => Boolean(entry))
      .sort(sortPresented);

    for (const entry of metrics) consumed.add(entry.entity.id);

    const sections = [...groups.values()]
      .filter((group) => group.variant !== 'metrics')
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
      .map((group) => {
        const entries = entities
          .filter((entity) => !consumed.has(entity.id))
          .map((entity) => {
            const metadata = entityMetadata.get(entityMatchKey(entity));
            return metadata?.group === group.id ? toPresentedEntity(entity, metadata) : null;
          })
          .filter((entry): entry is PresentedEntity => Boolean(entry))
          .sort(sortPresented);

        for (const entry of entries) consumed.add(entry.entity.id);

        return {
          id: group.id,
          title: group.title,
          order: group.order,
          defaultOpen: group.defaultOpen,
          entries
        };
      })
      .filter((section) => section.entries.length > 0);

    const remaining = entities.filter((entity) => !consumed.has(entity.id));
    const diagnostics = remaining.filter(isDiagnostic).map((entity) => toPresentedEntity(entity)).sort(sortPresented);
    const other = remaining.filter((entity) => !isDiagnostic(entity)).map((entity) => toPresentedEntity(entity)).sort(sortPresented);

    if (diagnostics.length > 0) {
      sections.push({ id: 'diagnostics_fallback', title: 'Diagnostics', order: 900, defaultOpen: false, entries: diagnostics });
    }
    if (other.length > 0) {
      sections.push({ id: 'other', title: 'Other', order: 990, defaultOpen: false, entries: other });
    }

    return { metrics, sections: sections.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)) };
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
</script>

{#snippet entityRow(entry: PresentedEntity)}
  {@const entity = entry.entity}
  <div class="entity">
    <div class="entity-meta">
      <span>{entry.label}</span>
      <small>{entity.component}{entity.deviceClass ? ` · ${entity.deviceClass}` : ''}</small>
    </div>

    <div class="entity-control">
      {#if entity.writable && entity.component === 'switch'}
        <button
          type="button"
          class="toggle"
          class:on={stateFor(entity).value === entity.payloadOn}
          disabled={commandPending[entity.id]}
          onclick={() => sendCommand(entity, stateFor(entity).value !== entity.payloadOn)}
        >
          {stateFor(entity).value === entity.payloadOn ? 'On' : 'Off'}
        </button>
      {:else if entity.writable && entity.component === 'number'}
        <input
          type="number"
          min={entity.min}
          max={entity.max}
          step={entity.step ?? 'any'}
          value={stateFor(entity).value ?? ''}
          disabled={commandPending[entity.id]}
          onblur={(event) => sendCommand(entity, event.currentTarget.value)}
        />
      {:else if entity.writable && entity.component === 'select'}
        <select
          value={stateFor(entity).value ?? ''}
          disabled={commandPending[entity.id]}
          onchange={(event) => sendCommand(entity, event.currentTarget.value)}
        >
          <option value="" disabled>Select</option>
          {#each entity.options ?? [] as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      {:else if entity.writable && entity.component === 'button'}
        <button
          type="button"
          class:danger={entity.dangerous}
          disabled={commandPending[entity.id]}
          onclick={() => sendCommand(entity)}
        >
          Send
        </button>
      {:else if entity.writable}
        <form
          onsubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const input = new FormData(form).get('value');
            sendCommand(entity, input);
            form.reset();
          }}
        >
          <input name="value" aria-label={`${entry.label} command`} disabled={commandPending[entity.id]} />
          <button type="submit" disabled={commandPending[entity.id]}>Set</button>
        </form>
      {:else}
        <span class="value">{formatState(entity)}</span>
      {/if}
    </div>

    {#if entity.writable && entity.component !== 'number'}
      <span class="value secondary">{formatState(entity)}</span>
    {/if}

    {#if commandErrors[entity.id]}
      <p class="command-error">{commandErrors[entity.id]}</p>
    {/if}
  </div>
{/snippet}

<svelte:head>
  <title>grow-app · {snapshot.site}</title>
  <meta
    name="description"
    content="Local site-mode grow HMI for broker health, live MQTT state, and discovered controls"
  />
</svelte:head>

<main class="shell">
  <section class="status-band" aria-label="Site status">
    <div>
      <p class="eyebrow">Site mode</p>
      <h1>{snapshot.site}</h1>
    </div>

    <dl class="stats">
      <div>
        <dt>Broker</dt>
        <dd class:ok={snapshot.broker.connected} class:bad={!snapshot.broker.connected}>
          {snapshot.broker.connected ? 'Connected' : snapshot.broker.connecting ? 'Connecting' : 'Offline'}
        </dd>
      </div>
      <div>
        <dt>Devices</dt>
        <dd>{snapshot.devices.length}</dd>
      </div>
      <div>
        <dt>Entities</dt>
        <dd>{snapshot.entities.length}</dd>
      </div>
      <div>
        <dt>Writable</dt>
        <dd>{writableCount}</dd>
      </div>
      <div>
        <dt>Last update</dt>
        <dd>{new Date(lastUpdate).toLocaleTimeString()}</dd>
      </div>
    </dl>
  </section>

  {#if snapshot.broker.error || error}
    <p class="banner">{snapshot.broker.error ?? error}</p>
  {/if}

  {#if snapshot.devices.length === 0}
    <section class="empty">
      <h2>Waiting for retained discovery</h2>
      <p>{snapshot.discoveryPrefix}/#</p>
    </section>
  {:else}
    <section class="device-grid" aria-label="Devices">
      {#each snapshot.devices as device (device.id)}
        {@const presentation = devicePresentation(device)}
        <article class="device">
          <header>
            <div>
              <p class="eyebrow">{device.manufacturer ?? 'ESPHome'}</p>
              <h2>{device.name}</h2>
              {#if device.model}
                <p class="subtle">{device.model}</p>
              {/if}
            </div>
            <span class:online={device.availability === 'online'} class:offline={device.availability === 'offline'} class="pill">
              {device.availability}
            </span>
          </header>

          {#if presentation.metrics.length > 0}
            <div class="metric-grid" aria-label={`${device.name} key readings`}>
              {#each presentation.metrics as entry (entry.entity.id)}
                <div class="metric">
                  <span>{entry.label}</span>
                  <strong>{formatState(entry.entity)}</strong>
                </div>
              {/each}
            </div>
          {/if}

          <div class="section-list">
            {#each presentation.sections as section (section.id)}
              <details class="device-section" open={section.defaultOpen}>
                <summary>
                  <span>{section.title}</span>
                  <small>{section.entries.length}</small>
                </summary>

                <div class="entity-list">
                  {#each section.entries as entry (entry.entity.id)}
                    {@render entityRow(entry)}
                  {/each}
                </div>
              </details>
            {/each}
          </div>
        </article>
      {/each}
    </section>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f4f7f5;
    color: #17211d;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  :global(button),
  :global(input),
  :global(select) {
    font: inherit;
  }

  .shell {
    min-height: 100vh;
    padding: clamp(16px, 3vw, 32px);
  }

  .status-band {
    display: grid;
    grid-template-columns: minmax(180px, 0.8fr) minmax(0, 2fr);
    gap: 24px;
    align-items: end;
    padding: 20px;
    border: 1px solid #d7ded9;
    border-radius: 8px;
    background: #ffffff;
  }

  h1,
  h2,
  p,
  dl {
    margin: 0;
  }

  h1 {
    font-size: clamp(2rem, 4rem, 3rem);
    line-height: 1;
  }

  h2 {
    font-size: 1.05rem;
  }

  .eyebrow {
    color: #52635c;
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(5, minmax(96px, 1fr));
    gap: 10px;
  }

  .stats div {
    min-width: 0;
    padding: 12px;
    border: 1px solid #e0e7e2;
    border-radius: 8px;
    background: #f9fbfa;
  }

  dt,
  small,
  .subtle,
  .secondary {
    color: #66736e;
  }

  dt {
    font-size: 0.72rem;
  }

  dd {
    margin: 4px 0 0;
    overflow-wrap: anywhere;
    font-weight: 700;
  }

  .ok,
  .online {
    color: #136f3b;
  }

  .bad,
  .offline,
  .command-error {
    color: #a62b24;
  }

  .banner,
  .empty {
    margin-top: 16px;
    padding: 16px;
    border: 1px solid #e8c5c0;
    border-radius: 8px;
    background: #fff7f5;
  }

  .device-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
    gap: 16px;
    margin-top: 16px;
  }

  .device {
    border: 1px solid #d7ded9;
    border-radius: 8px;
    background: #ffffff;
  }

  .device header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid #e5ebe7;
  }

  .pill {
    height: fit-content;
    flex: 0 0 auto;
    padding: 4px 8px;
    border: 1px solid #d7ded9;
    border-radius: 999px;
    background: #f8faf9;
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: capitalize;
  }

  .entity-list {
    display: grid;
  }

  .metric-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    gap: 10px;
    padding: 16px;
    border-bottom: 1px solid #e5ebe7;
    background: #f9fbfa;
  }

  .metric {
    min-width: 0;
    padding: 12px;
    border: 1px solid #d7ded9;
    border-radius: 8px;
    background: #ffffff;
  }

  .metric span {
    display: block;
    color: #52635c;
    font-size: 0.72rem;
    font-weight: 700;
  }

  .metric strong {
    display: block;
    margin-top: 6px;
    overflow-wrap: anywhere;
    font-size: 1.28rem;
    line-height: 1.1;
  }

  .section-list {
    display: grid;
  }

  .device-section {
    border-top: 1px solid #e5ebe7;
  }

  .device-section:first-child {
    border-top: 0;
  }

  .device-section summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    padding: 12px 16px;
    cursor: pointer;
    color: #26342e;
    font-weight: 800;
  }

  .device-section summary small {
    min-width: 28px;
    padding: 2px 8px;
    border-radius: 999px;
    background: #edf3ef;
    text-align: center;
    font-size: 0.72rem;
  }

  .device-section[open] summary {
    border-bottom: 1px solid #edf1ee;
    background: #fbfcfb;
  }

  .entity {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) minmax(120px, auto);
    gap: 10px;
    align-items: center;
    padding: 12px 16px;
    border-top: 1px solid #edf1ee;
  }

  .entity-meta {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .entity-meta span,
  .value {
    overflow-wrap: anywhere;
  }

  .entity-control {
    display: flex;
    justify-content: flex-end;
    min-width: 0;
  }

  .entity-control form {
    display: flex;
    gap: 6px;
  }

  .entity-control input,
  .entity-control select {
    width: min(180px, 38vw);
    min-height: 36px;
    box-sizing: border-box;
    border: 1px solid #cbd6cf;
    border-radius: 6px;
    background: #ffffff;
    color: #17211d;
  }

  button {
    min-height: 36px;
    border: 1px solid #1f6f54;
    border-radius: 6px;
    background: #1f6f54;
    color: #ffffff;
    cursor: pointer;
    font-weight: 700;
  }

  button:disabled,
  input:disabled,
  select:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .toggle {
    min-width: 72px;
    border-color: #7c8795;
    background: #7c8795;
  }

  .toggle.on {
    border-color: #1f6f54;
    background: #1f6f54;
  }

  .danger {
    border-color: #a62b24;
    background: #a62b24;
  }

  .value.secondary {
    grid-column: 1 / -1;
    font-size: 0.82rem;
  }

  .command-error {
    grid-column: 1 / -1;
    font-size: 0.82rem;
  }

  @media (max-width: 820px) {
    .status-band,
    .entity {
      grid-template-columns: 1fr;
    }

    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .entity-control {
      justify-content: stretch;
    }

    .entity-control input,
    .entity-control select,
    .entity-control button,
    .entity-control form {
      width: 100%;
    }
  }
</style>
