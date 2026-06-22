<script lang="ts">
  import EntityRow from '$lib/EntityRow.svelte';
  import CameraImageTile from '$lib/CameraImageTile.svelte';
  import { dashboardPresentation } from '$lib/device-presentation';
  import { createLiveSnapshot } from '$lib/live-snapshot.svelte';
  import type { Snapshot } from '$lib/server/mqtt/types';

  let { data } = $props<{ data: { snapshot: Snapshot } }>();

  // svelte-ignore state_referenced_locally
  const live = createLiveSnapshot(data.snapshot);

  let writableCount = $derived(live.snapshot.entities.filter((entity) => entity.writable).length);
  let lastUpdate = $derived(live.snapshot.broker.lastMessageAt ?? live.snapshot.generatedAt);

  $effect(() => live.connect());

  function deviceSettingsHref(nodeId: string): string {
    return `/device-settings?device=${encodeURIComponent(nodeId)}`;
  }
</script>

<svelte:head>
  <title>grow-app · {live.snapshot.site}</title>
  <meta
    name="description"
    content="Local site-mode grow HMI for broker health, live MQTT state, and discovered controls"
  />
</svelte:head>

<main class="shell">
  <section class="status-band" aria-label="Site status">
    <div>
      <p class="eyebrow">Site mode</p>
      <h1>{live.snapshot.site}</h1>
    </div>

    <dl class="stats">
      <div>
        <dt>Broker</dt>
        <dd class:ok={live.snapshot.broker.connected} class:bad={!live.snapshot.broker.connected}>
          {live.snapshot.broker.connected ? 'Connected' : live.snapshot.broker.connecting ? 'Connecting' : 'Offline'}
        </dd>
      </div>
      <div>
        <dt>Devices</dt>
        <dd>{live.snapshot.devices.length}</dd>
      </div>
      <div>
        <dt>Entities</dt>
        <dd>{live.snapshot.entities.length}</dd>
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

  {#if live.snapshot.broker.error || live.error}
    <p class="banner">{live.snapshot.broker.error ?? live.error}</p>
  {/if}

  {#if live.snapshot.devices.length === 0}
    <section class="empty">
      <h2>Waiting for retained discovery</h2>
      <p>{live.snapshot.discoveryPrefix}/#</p>
    </section>
  {:else}
    <section class="device-grid" aria-label="Devices">
      {#each live.snapshot.devices as device (device.id)}
        {@const presentation = dashboardPresentation(live.snapshot, device)}
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
                  <strong>{live.formatState(entry.entity)}</strong>
                </div>
              {/each}
            </div>
          {/if}

          {#if presentation.cameras.length > 0}
            <section class="camera-tiles" aria-label={`${device.name} cameras`}>
              {#each presentation.cameras as entry (entry.entity.id)}
                <CameraImageTile {entry} available={device.availability !== 'offline'} />
              {/each}
            </section>
          {/if}

          {#if presentation.quickControls.length > 0}
            <section class="quick-controls" aria-label={`${device.name} quick controls`}>
              <div class="section-heading">
                <h3>Quick controls</h3>
                <small>{presentation.quickControls.length}</small>
              </div>
              <div class="entity-list">
                {#each presentation.quickControls as entry (entry.entity.id)}
                  <EntityRow
                    {entry}
                    state={live.stateFor(entry.entity)}
                    pending={live.commandPending[entry.entity.id]}
                    error={live.commandErrors[entry.entity.id]}
                    onCommand={live.sendCommand}
                  />
                {/each}
              </div>
            </section>
          {/if}

          <div class="device-actions">
            <a class="settings-link" href={deviceSettingsHref(device.nodeId)}>Device settings</a>
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
  h3,
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

  h3 {
    font-size: 0.95rem;
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
  .subtle {
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
  .offline {
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
    align-items: start;
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

  .camera-tiles {
    padding: 16px;
    border-bottom: 1px solid #e5ebe7;
    background: #f9fbfa;
  }

  .quick-controls {
    border-bottom: 1px solid #e5ebe7;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    padding: 12px 16px;
    color: #26342e;
    font-weight: 800;
  }

  .section-heading small {
    min-width: 28px;
    padding: 2px 8px;
    border-radius: 999px;
    background: #edf3ef;
    text-align: center;
    font-size: 0.72rem;
  }

  .entity-list {
    display: grid;
  }

  .device-actions {
    display: flex;
    justify-content: flex-end;
    padding: 12px 16px;
  }

  .settings-link {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    padding: 0 12px;
    border: 1px solid #cbd6cf;
    border-radius: 6px;
    color: #17211d;
    background: #f8faf9;
    font-weight: 700;
    text-decoration: none;
  }

  .settings-link:hover {
    border-color: #1f6f54;
    color: #1f6f54;
  }

  @media (max-width: 820px) {
    .status-band {
      grid-template-columns: 1fr;
    }

    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
