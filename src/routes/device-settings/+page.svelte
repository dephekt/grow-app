<script lang="ts">
  import EntityRow from '$lib/EntityRow.svelte';
  import FirmwareUpdatesPanel from '$lib/FirmwareUpdatesPanel.svelte';
  import AlertsPanel from '$lib/AlertsPanel.svelte';
  import CalibrationPanel from '$lib/CalibrationPanel.svelte';
  import { deviceSettingsPresentation, DEVICE_SETTINGS_SECTIONS } from '$lib/device-presentation';
  import type { DeviceSettingsSectionId } from '$lib/device-presentation';
  import { getLiveSnapshot } from '$lib/live-snapshot-context';
  import { parseFirmwareUpdateState } from '$lib/firmware';
  import type { DeviceSnapshot, EntityConfig } from '$lib/server/mqtt/types';
  import { page } from '$app/state';

  let { data } = $props<{
    data: {
      selectedDeviceId: string | null;
      selectedSectionId: string | null;
    };
  }>();

  const live = getLiveSnapshot();

  // Resolve selected device from URL param or default to first
  let devices = $derived(live.snapshot.devices ?? []);
  let selectedDevice = $derived(
    devices.find(
      (d) => d.nodeId === (page.url.searchParams.get('device') ?? data.selectedDeviceId) ||
             d.id === (page.url.searchParams.get('device') ?? data.selectedDeviceId)
    ) ?? devices[0] ?? null
  );

  // Active section
  let activeSectionId = $derived<DeviceSettingsSectionId | null>(
    (page.url.searchParams.get('section') ?? data.selectedSectionId) as DeviceSettingsSectionId | null
  );

  // Entity-based panels from device-presentation
  let entityPanels = $derived(selectedDevice ? deviceSettingsPresentation(live.snapshot, selectedDevice) : []);

  // Firmware info for selected device
  let firmwareConfig = $derived(
    selectedDevice
      ? (live.snapshot.firmware?.devices?.[selectedDevice.nodeId] ?? live.snapshot.firmware?.devices?.[selectedDevice.id] ?? null)
      : null
  );

  // Detect firmware update availability
  function deviceHasUpdate(device: DeviceSnapshot): boolean {
    const fc = live.snapshot.firmware?.devices?.[device.nodeId] ?? live.snapshot.firmware?.devices?.[device.id] ?? null;
    const allEntities = live.snapshot.entities ?? [];
    const updateEntity = allEntities.find(
      (e) => (e.nodeId === device.nodeId || e.device?.identifiers?.includes(device.nodeId)) && e.component === 'update'
    );
    if (updateEntity) {
      const stateVal = live.snapshot.states[updateEntity.id]?.value;
      const updateState = parseFirmwareUpdateState(stateVal);
      if (
        updateState.latestVersion &&
        updateState.installedVersion &&
        updateState.latestVersion !== updateState.installedVersion
      ) return true;
    }
    if (fc) {
      const latestVersion = allEntities.reduce<string | null>((acc, e) => {
        if (e.component === 'update' && (e.nodeId === device.nodeId)) {
          const s = parseFirmwareUpdateState(live.snapshot.states[e.id]?.value);
          return s.latestVersion ?? acc;
        }
        return acc;
      }, null);
      if (latestVersion && fc.installedVersion && latestVersion !== fc.installedVersion) return true;
    }
    return false;
  }

  // All tabs to show (firmware 'updates' pseudo-panel + entity panels)
  let allTabs = $derived.by(() => {
    const tabs: Array<{ id: DeviceSettingsSectionId; title: string; count: number; hasUpdate: boolean }> = [];

    // Add updates tab if firmware config exists
    if (firmwareConfig) {
      tabs.push({ id: 'updates', title: 'Updates', count: 0, hasUpdate: false });
    }

    // Add entity-based tabs
    for (const panel of entityPanels) {
      tabs.push({ id: panel.id, title: panel.title, count: panel.entryCount, hasUpdate: false });
    }

    return tabs;
  });

  let activeTabId = $derived<DeviceSettingsSectionId | null>(
    allTabs.find((t) => t.id === activeSectionId)?.id ?? allTabs[0]?.id ?? null
  );

  let activeEntityPanel = $derived(entityPanels.find((p) => p.id === activeTabId) ?? null);

  // Device entities (for curated renderers)
  let deviceEntityList = $derived.by((): EntityConfig[] => {
    if (!selectedDevice) return [];
    const entitiesById = new Map((live.snapshot.entities ?? []).map((e) => [e.id, e]));
    return (selectedDevice.entityIds ?? [])
      .map((id) => entitiesById.get(id))
      .filter((e): e is EntityConfig => Boolean(e));
  });

  // Is the alerts tab showing curated content?
  function isAlertsCurated(panel: typeof activeEntityPanel): boolean {
    if (!panel) return false;
    const allEntries = panel.groups.flatMap((g) => g.entries);
    return allEntries.some((e) => {
      const oid = (e.entity.objectId ?? e.entity.id).toLowerCase();
      return (e.entity.component === 'number' && (oid.includes('threshold') || oid.includes('high') || oid.includes('low')));
    }) && allEntries.some((e) => {
      const oid = (e.entity.objectId ?? e.entity.id).toLowerCase();
      const nm = (e.entity.name ?? '').toLowerCase();
      return e.entity.component === 'binary_sensor' && (oid.includes('alert') || nm.includes('alert'));
    });
  }

  // Is the calibration tab showing curated content?
  function isCalibrationCurated(panel: typeof activeEntityPanel): boolean {
    if (!panel) return false;
    const allEntries = panel.groups.flatMap((g) => g.entries);
    return allEntries.some((e) => {
      const oid = (e.entity.objectId ?? e.entity.id).toLowerCase();
      return oid.includes('_cal') || oid.includes('cal_');
    });
  }

  // Section open/close state (for generic entity list)
  let sectionOpen = $state<Record<string, boolean>>({});

  function getSectionOpen(sectionId: string, defaultOpen: boolean): boolean {
    return sectionOpen[sectionId] ?? defaultOpen;
  }

  function toggleSection(sectionId: string, currentlyOpen: boolean) {
    sectionOpen = { ...sectionOpen, [sectionId]: !currentlyOpen };
  }

  // Navigation helpers
  function deviceHref(device: DeviceSnapshot, sectionId?: DeviceSettingsSectionId | null): string {
    const params = new URLSearchParams({ device: device.nodeId });
    if (sectionId) params.set('section', sectionId);
    return `/device-settings?${params.toString()}`;
  }

  function tabHref(sectionId: DeviceSettingsSectionId): string {
    if (!selectedDevice) return '/device-settings';
    const params = new URLSearchParams({ device: selectedDevice.nodeId, section: sectionId });
    return `/device-settings?${params.toString()}`;
  }

  // Availability helpers
  function isOnline(device: DeviceSnapshot): boolean {
    return device.availability === 'online';
  }

  function dotClass(device: DeviceSnapshot): string {
    if (device.availability === 'online') return 'ok';
    if (device.availability === 'offline') return 'alert';
    return '';
  }
</script>

<svelte:head>
  <title>Device Settings · {live.snapshot.site}</title>
  <meta name="description" content="Device-specific grow HMI controls, calibration, maintenance, diagnostics, and alerts" />
</svelte:head>

<div class="settings-shell">
  <!-- ── Left: Controller selector ── -->
  <nav class="controller-list" aria-label="Devices">
    <div class="controller-list-head">
      <span class="panel-title">Controllers</span>
    </div>
    {#each devices as device (device.id)}
      {@const selected = device.id === selectedDevice?.id}
      {@const hasUpdate = deviceHasUpdate(device)}
      <a
        class="controller-row"
        class:selected
        href={deviceHref(device, activeTabId)}
        aria-current={selected ? 'page' : undefined}
      >
        <span class="dot {dotClass(device)}"></span>
        <div class="controller-info">
          <span class="controller-name">{device.name}</span>
          <span class="controller-node mono muted">{device.nodeId}</span>
        </div>
        {#if hasUpdate}
          <span class="update-dot dot warn" title="Firmware update available"></span>
        {/if}
      </a>
    {/each}

    {#if devices.length === 0}
      <p class="no-devices muted">Waiting for device discovery…</p>
    {/if}
  </nav>

  <!-- ── Right: Device workspace ── -->
  <div class="workspace">
    {#if !selectedDevice}
      <div class="empty-state panel">
        <p class="muted">No device selected.</p>
      </div>
    {:else}
      <!-- Device header -->
      <div class="device-header">
        <div class="device-header-meta">
          <h1 class="device-name">{selectedDevice.name}</h1>
          <span class="device-node mono muted">{selectedDevice.nodeId}</span>
        </div>
        <div class="device-header-right">
          {#if selectedDevice.model}
            <span class="device-model muted">{selectedDevice.model}</span>
          {/if}
          <span
            class="availability-pill"
            class:pill-online={isOnline(selectedDevice)}
            class:pill-offline={selectedDevice.availability === 'offline'}
          >
            {selectedDevice.availability.toUpperCase()}
          </span>
        </div>
      </div>

      <!-- Category tabs -->
      {#if allTabs.length > 0}
        <nav class="section-tabs" aria-label="Settings sections">
          {#each allTabs as tab (tab.id)}
            <a
              class="section-tab"
              class:active={tab.id === activeTabId}
              href={tabHref(tab.id)}
              aria-current={tab.id === activeTabId ? 'page' : undefined}
            >
              <span>{tab.title}</span>
              {#if tab.count > 0}
                <span class="tab-count mono">{tab.count}</span>
              {/if}
              {#if tab.hasUpdate}
                <span class="tab-dot dot warn"></span>
              {/if}
            </a>
          {/each}
        </nav>
      {/if}

      <!-- Tab content -->
      <div class="tab-content">
        {#if activeTabId === 'updates'}
          <!-- ── Updates (OTA) ── -->
          {#if firmwareConfig}
            <FirmwareUpdatesPanel snapshot={live.snapshot} device={selectedDevice} />
          {:else}
            <div class="empty-section panel">
              <p class="muted">No firmware info available for this device.</p>
            </div>
          {/if}

        {:else if activeTabId === 'alerts' && activeEntityPanel}
          <!-- ── Alerts (curated if recognized shape, else generic) ── -->
          {#if isAlertsCurated(activeEntityPanel)}
            <AlertsPanel groups={activeEntityPanel.groups} {live} deviceEntities={deviceEntityList} />
          {:else}
            {@render genericSectionList(activeEntityPanel.groups)}
          {/if}

        {:else if activeTabId === 'calibration' && activeEntityPanel}
          <!-- ── Calibration (curated if probe cal entities exist, else generic) ── -->
          {#if isCalibrationCurated(activeEntityPanel)}
            <CalibrationPanel groups={activeEntityPanel.groups} {live} deviceEntities={deviceEntityList} />
          {:else}
            {@render genericSectionList(activeEntityPanel.groups)}
          {/if}

        {:else if activeEntityPanel}
          <!-- ── Generic sections (Controls, Maintenance, Diagnostics, Other) ── -->
          {@render genericSectionList(activeEntityPanel.groups)}

        {:else if allTabs.length === 0}
          <div class="empty-section panel">
            <p class="muted">This device has no configurable settings.</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

{#snippet genericSectionList(groups: typeof activeEntityPanel extends null ? never : NonNullable<typeof activeEntityPanel>['groups'])}
  <div class="section-list">
    {#each groups as group (group.id)}
      {@const open = getSectionOpen(group.id, group.defaultOpen)}
      <div class="section-group panel">
        <button
          type="button"
          class="section-summary"
          aria-expanded={open}
          onclick={() => toggleSection(group.id, open)}
        >
          <span class="expand-icon">{open ? '−' : '+'}</span>
          <span class="section-title">{group.title}</span>
          <span class="section-count mono muted">{group.entries.length}</span>
        </button>

        {#if open}
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
        {/if}
      </div>
    {/each}
  </div>
{/snippet}

<style>
  /* ── Layout ── */
  .settings-shell {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: var(--gap);
    min-height: calc(100vh - 48px);
  }

  /* ── Controller list ── */
  .controller-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--r-panel);
    overflow: hidden;
    align-self: start;
  }

  .controller-list-head {
    padding: 12px 14px 8px;
    border-bottom: 1px solid var(--line);
  }

  .panel-title {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .controller-row {
    display: grid;
    grid-template-columns: 8px 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line);
    color: var(--text);
    text-decoration: none;
    transition: background 0.1s;
  }

  .controller-row:last-child {
    border-bottom: none;
  }

  .controller-row:hover {
    background: var(--panel-2);
  }

  .controller-row.selected {
    background: var(--amber-dim);
    border-left: 2px solid var(--amber);
    padding-left: 12px;
  }

  .controller-info {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .controller-name {
    font-weight: 600;
    font-size: 0.88rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .controller-node {
    font-size: 0.72rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .update-dot {
    width: 7px;
    height: 7px;
    flex: none;
  }

  .no-devices {
    margin: 0;
    padding: 16px 14px;
    font-size: 0.82rem;
  }

  /* ── Workspace ── */
  .workspace {
    display: grid;
    gap: var(--gap);
    align-content: start;
  }

  /* ── Device header ── */
  .device-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--r-panel);
  }

  .device-header-meta {
    display: grid;
    gap: 4px;
  }

  .device-name {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
    line-height: 1;
  }

  .device-node {
    font-size: 0.78rem;
  }

  .device-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: none;
  }

  .device-model {
    font-size: 0.82rem;
  }

  .availability-pill {
    padding: 3px 10px;
    border-radius: var(--r-pill);
    font-size: 0.7rem;
    font-weight: 700;
    font-family: var(--font-mono);
    letter-spacing: 0.08em;
    border: 1px solid var(--line-strong);
    background: var(--panel-2);
    color: var(--muted);
  }

  .pill-online {
    border-color: rgba(63, 185, 80, 0.3);
    background: rgba(63, 185, 80, 0.1);
    color: var(--ok);
  }

  .pill-offline {
    border-color: rgba(240, 86, 58, 0.3);
    background: rgba(240, 86, 58, 0.1);
    color: var(--alert);
  }

  /* ── Section tabs ── */
  .section-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .section-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    min-height: var(--tap);
    border: 1px solid var(--line-strong);
    border-radius: var(--r-control);
    background: var(--panel);
    color: var(--muted);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    text-decoration: none;
    transition: color 0.1s, border-color 0.1s, background 0.1s;
  }

  .section-tab:hover {
    background: var(--panel-2);
    color: var(--text);
  }

  .section-tab.active {
    border-color: var(--amber);
    background: var(--amber-dim);
    color: var(--amber);
  }

  .tab-count {
    padding: 1px 6px;
    border-radius: var(--r-pill);
    background: rgba(255, 255, 255, 0.06);
    font-size: 0.7rem;
  }

  .section-tab.active .tab-count {
    background: rgba(255, 176, 0, 0.15);
  }

  .tab-dot {
    width: 7px;
    height: 7px;
    flex: none;
  }

  /* ── Tab content ── */
  .tab-content {
    display: grid;
    gap: var(--gap);
  }

  .empty-state,
  .empty-section {
    padding: 32px;
    text-align: center;
  }

  /* ── Generic section list ── */
  .section-list {
    display: grid;
    gap: var(--gap);
  }

  .section-group {
    overflow: hidden;
    padding: 0;
  }

  .section-summary {
    display: grid;
    grid-template-columns: 20px 1fr auto;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 10px 18px;
    border: none;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    text-align: left;
    transition: background 0.1s;
  }

  .section-summary:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .section-summary[aria-expanded='true'] {
    border-bottom: 1px solid var(--line);
  }

  .expand-icon {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border: 1px solid var(--line-strong);
    border-radius: var(--r-pill);
    font-size: 0.9rem;
    font-weight: 800;
    color: var(--amber);
    line-height: 1;
  }

  .section-title {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .section-count {
    padding: 1px 8px;
    border-radius: var(--r-pill);
    background: rgba(255, 255, 255, 0.06);
    font-size: 0.7rem;
    color: var(--muted);
  }

  .entity-list {
    display: grid;
  }

  /* ── Shared utils ── */
  .dot {
    width: 8px;
    height: 8px;
    border-radius: var(--r-pill);
    background: var(--faint);
    flex: none;
  }
  .dot.ok { background: var(--ok); }
  .dot.warn { background: var(--amber); }
  .dot.alert { background: var(--alert); }

  .muted { color: var(--muted); }
  .mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  /* ── Responsive ── */
  @media (max-width: 820px) {
    .settings-shell {
      grid-template-columns: 1fr;
    }

    .controller-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    }

    .controller-list-head {
      grid-column: 1 / -1;
    }
  }
</style>
