<script lang="ts">
  import EntityRow from '$lib/EntityRow.svelte';
  import FirmwareUpdatesPanel from '$lib/FirmwareUpdatesPanel.svelte';
  import { deviceSettingsPresentation } from '$lib/device-presentation';
  import { createLiveSnapshot } from '$lib/live-snapshot.svelte';
  import type { DeviceSettingsPanel } from '$lib/device-presentation';
  import type { DeviceSnapshot, Snapshot } from '$lib/server/mqtt/types';

  let { data } = $props<{
    data: {
      snapshot: Snapshot;
      selectedDeviceId: string | null;
      selectedSectionId: string | null;
    };
  }>();

  // svelte-ignore state_referenced_locally
  const live = createLiveSnapshot(data.snapshot);

  let devices = $derived(live.snapshot.devices ?? []);
  let selectedDevice = $derived(
    devices.find((device) => device.nodeId === data.selectedDeviceId || device.id === data.selectedDeviceId) ?? devices[0]
  );
  let panels = $derived(selectedDevice ? deviceSettingsPresentation(live.snapshot, selectedDevice) : []);
  let activePanel = $derived(
    panels.find((panel) => panel.id === data.selectedSectionId) ?? panels[0] ?? null
  );

  $effect(() => live.connect());

  function deviceSettingsHref(device: DeviceSnapshot, panel?: DeviceSettingsPanel | null): string {
    const params = new URLSearchParams({ device: device.nodeId });
    if (panel) params.set('section', panel.id);
    return `/device-settings?${params.toString()}`;
  }
</script>

<svelte:head>
  <title>Device settings · {live.snapshot.site}</title>
  <meta name="description" content="Device-specific grow HMI controls, calibration, maintenance, diagnostics, and alerts" />
</svelte:head>

<main class="shell">
  <header class="page-header">
    <div>
      <a class="back-link" href="/">Dashboard</a>
      <p class="eyebrow">Device settings</p>
      <h1>{selectedDevice?.name ?? live.snapshot.site}</h1>
      {#if selectedDevice?.model}
        <p class="subtle">{selectedDevice.model}</p>
      {/if}
    </div>

    {#if selectedDevice}
      <span class:online={selectedDevice.availability === 'online'} class:offline={selectedDevice.availability === 'offline'} class="pill">
        {selectedDevice.availability}
      </span>
    {/if}
  </header>

  {#if live.snapshot.broker.error || live.error}
    <p class="banner">{live.snapshot.broker.error ?? live.error}</p>
  {/if}

  {#if devices.length === 0}
    <section class="empty">
      <h2>Waiting for retained discovery</h2>
      <p>{live.snapshot.discoveryPrefix}/#</p>
    </section>
  {:else if selectedDevice}
    <div class="settings-layout">
      <nav class="device-nav" aria-label="Devices">
        {#each devices as device (device.id)}
          <a
            aria-current={device.id === selectedDevice.id ? 'page' : undefined}
            class:selected={device.id === selectedDevice.id}
            href={deviceSettingsHref(device)}
          >
            <span>{device.name}</span>
            <small>{device.availability}</small>
          </a>
        {/each}
      </nav>

      <section class="settings-workspace" aria-label={`${selectedDevice.name} settings`}>
        {#if panels.length > 0}
          <nav class="section-tabs" aria-label="Device settings sections">
            {#each panels as panel (panel.id)}
              <a
                aria-current={panel.id === activePanel?.id ? 'page' : undefined}
                class:active={panel.id === activePanel?.id}
                href={deviceSettingsHref(selectedDevice, panel)}
              >
                <span>{panel.title}</span>
                <small>{panel.entryCount}</small>
              </a>
            {/each}
          </nav>
        {/if}

        <div class="updates-region">
          <FirmwareUpdatesPanel snapshot={live.snapshot} device={selectedDevice} />
        </div>

        {#if activePanel}
          <div class="group-list">
            {#each activePanel.groups as group (group.id)}
              <details class="settings-group" open>
                <summary>
                  <h3>{group.title}</h3>
                  <small>{group.entries.length}</small>
                </summary>

                <div class="entity-list">
                  {#each group.entries as entry (entry.entity.id)}
                    <EntityRow
                      {entry}
                      state={live.stateFor(entry.entity)}
                      pending={live.commandPending[entry.entity.id]}
                      error={live.commandErrors[entry.entity.id]}
                      onCommand={live.sendCommand}
                    />
                  {/each}
                </div>
              </details>
            {/each}
          </div>
        {:else}
          <section class="empty">
            <h2>No device settings</h2>
            <p>This device only exposes dashboard metrics right now.</p>
          </section>
        {/if}
      </section>
    </div>
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

  .page-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    padding: 20px;
    border: 1px solid #d7ded9;
    border-radius: 8px;
    background: #ffffff;
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  h1 {
    margin-top: 6px;
    font-size: clamp(1.8rem, 3rem, 2.5rem);
    line-height: 1;
  }

  h2 {
    font-size: 1.35rem;
  }

  h3 {
    font-size: 1rem;
  }

  .eyebrow {
    color: #52635c;
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  small,
  .subtle {
    color: #66736e;
  }

  .back-link {
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    margin-bottom: 10px;
    color: #1f6f54;
    font-weight: 700;
    text-decoration: none;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .online {
    color: #136f3b;
  }

  .offline {
    color: #a62b24;
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

  .banner,
  .empty {
    margin-top: 16px;
    padding: 16px;
    border: 1px solid #e8c5c0;
    border-radius: 8px;
    background: #fff7f5;
  }

  .settings-layout {
    display: grid;
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
    gap: 16px;
    margin-top: 16px;
  }

  .device-nav,
  .section-tabs {
    display: grid;
    gap: 8px;
  }

  .device-nav {
    align-content: start;
  }

  .device-nav a,
  .section-tabs a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    min-height: 40px;
    padding: 10px 12px;
    border: 1px solid #d7ded9;
    border-radius: 8px;
    background: #ffffff;
    color: #17211d;
    font-weight: 700;
    text-decoration: none;
  }

  .section-tabs a {
    flex: 0 0 auto;
    width: auto;
    min-width: min(100%, 132px);
    max-width: 100%;
  }

  .device-nav a.selected,
  .section-tabs a.active {
    border-color: #1f6f54;
    background: #eef7f2;
    color: #136f3b;
  }

  .device-nav a span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .section-tabs a span {
    white-space: nowrap;
  }

  .settings-workspace {
    min-width: 0;
  }

  .section-tabs {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
  }

  .section-tabs small {
    min-width: 28px;
    padding: 2px 8px;
    border-radius: 999px;
    background: #edf3ef;
    text-align: center;
    font-size: 0.72rem;
  }

  .group-list {
    display: grid;
    gap: 16px;
    margin-top: 16px;
  }

  .updates-region {
    margin-top: 16px;
  }

  .settings-group {
    overflow: hidden;
    border: 1px solid #d7ded9;
    border-radius: 8px;
    background: #ffffff;
  }

  .settings-group summary {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    padding: 12px 16px;
    color: #26342e;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }

  .settings-group[open] summary {
    border-bottom: 1px solid #edf1ee;
  }

  .settings-group summary::-webkit-details-marker {
    display: none;
  }

  .settings-group summary::before {
    content: "+";
    display: grid;
    width: 20px;
    height: 20px;
    align-items: center;
    border: 1px solid #cad4ce;
    border-radius: 999px;
    color: #1f6f54;
    font-size: 0.9rem;
    font-weight: 800;
    line-height: 1;
    place-items: center;
  }

  .settings-group[open] summary::before {
    content: "-";
  }

  .settings-group summary h3 {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .settings-group summary small {
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

  @media (max-width: 820px) {
    .page-header {
      display: grid;
    }

    .settings-layout {
      grid-template-columns: 1fr;
    }

    .device-nav {
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
    }
  }
</style>
