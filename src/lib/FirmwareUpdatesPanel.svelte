<script lang="ts">
  import { parseFirmwareUpdateState, parseProjectVersion } from '$lib/firmware';
  import type { FirmwarePackageManifest } from '$lib/server/firmware/packages';
  import type { DeviceSnapshot, EntityConfig, FirmwareChannel, Snapshot } from '$lib/server/mqtt/types';

  let { snapshot, device } = $props<{
    snapshot: Snapshot;
    device: DeviceSnapshot;
  }>();

  let packageInfo = $state<FirmwarePackageManifest | null>(null);
  let lookupPending = $state(false);
  let lookupError = $state('');
  let channelPending = $state(false);
  let commandPending = $state(false);
  let commandMessage = $state('');
  let channelOverride = $state<FirmwareChannel | null>(null);
  let lastNodeId = $state<string | null>(null);
  let requestId = 0;

  let nodeId = $derived(device.nodeId);
  let firmwareConfig = $derived(snapshot.firmware.devices[nodeId] ?? snapshot.firmware.devices[device.id] ?? null);
  let channelConfig = $derived(snapshot.firmware.channels[nodeId] ?? null);
  let selectedChannel = $derived(channelOverride ?? channelConfig?.channel ?? 'stable');
  let deviceEntities = $derived(
    snapshot.entities.filter((entity: EntityConfig) => entity.nodeId === nodeId || entity.device.identifiers.includes(nodeId))
  );
  let updateEntity = $derived(deviceEntities.find((entity: EntityConfig) => entity.component === 'update' && entity.commandTopic));
  let checkButton = $derived(
    deviceEntities.find((entity: EntityConfig) => {
      const value = `${entity.name} ${entity.objectId ?? ''}`.toLowerCase();
      return entity.component === 'button' && value.includes('firmware') && value.includes('check');
    })
  );
  let updateState = $derived(parseFirmwareUpdateState(updateEntity ? snapshot.states[updateEntity.id]?.value : null));
  let installedVersion = $derived(
    firmwareConfig?.installedVersion ?? updateState.installedVersion ?? parseProjectVersion(device.swVersion) ?? 'Unknown'
  );
  let latestVersion = $derived(packageInfo?.version ?? updateState.latestVersion ?? 'Unknown');
  let canApply = $derived(
    Boolean(
      updateEntity &&
        packageInfo &&
        packageInfo.version !== installedVersion &&
        updateState.latestVersion === packageInfo.version &&
        !commandPending
    )
  );
  let applyBlockedReason = $derived(applyReason(updateEntity, packageInfo, updateState.latestVersion, installedVersion));

  $effect(() => {
    if (lastNodeId !== nodeId) {
      lastNodeId = nodeId;
      channelOverride = null;
      commandMessage = '';
    }
  });

  $effect(() => {
    if (!firmwareConfig) {
      packageInfo = null;
      lookupError = '';
      return;
    }
    void loadPackage(nodeId, selectedChannel);
  });

  async function loadPackage(currentNodeId: string, channel: FirmwareChannel): Promise<void> {
    const id = requestId + 1;
    requestId = id;
    lookupPending = true;
    lookupError = '';

    const response = await fetch(`/api/firmware/devices/${encodeURIComponent(currentNodeId)}/package?channel=${channel}`);
    const body = (await response.json().catch(() => ({}))) as { package?: FirmwarePackageManifest | null; error?: string };

    if (requestId !== id) return;
    lookupPending = false;

    if (!response.ok) {
      packageInfo = null;
      lookupError = body.error ?? 'Package lookup failed';
      return;
    }

    packageInfo = body.package ?? null;
  }

  async function selectChannel(channel: FirmwareChannel): Promise<void> {
    if (!firmwareConfig || channel === selectedChannel || channelPending) return;
    channelPending = true;
    commandMessage = '';

    const response = await fetch(`/api/firmware/devices/${encodeURIComponent(nodeId)}/channel`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel })
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    channelPending = false;

    if (!response.ok) {
      commandMessage = body.error ?? 'Channel update failed';
      return;
    }

    channelOverride = channel;
  }

  async function checkForUpdate(): Promise<void> {
    if (!firmwareConfig || commandPending) return;
    commandPending = true;
    commandMessage = '';

    const response = await fetch(`/api/firmware/devices/${encodeURIComponent(nodeId)}/check`, { method: 'POST' });
    const body = (await response.json().catch(() => ({}))) as {
      package?: FirmwarePackageManifest | null;
      checkTriggered?: boolean;
      error?: string;
    };
    commandPending = false;

    if (!response.ok) {
      commandMessage = body.error ?? 'Update check failed';
      return;
    }

    packageInfo = body.package ?? null;
    commandMessage = body.checkTriggered ? 'Device check requested' : 'Package lookup refreshed';
  }

  async function applyUpdate(): Promise<void> {
    if (!packageInfo || !canApply || commandPending) return;
    commandPending = true;
    commandMessage = '';

    const response = await fetch(`/api/firmware/devices/${encodeURIComponent(nodeId)}/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: packageInfo.version })
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    commandPending = false;
    commandMessage = response.ok ? 'Install requested' : body.error ?? 'Install request failed';
  }

  function applyReason(
    entity: EntityConfig | undefined,
    selectedPackage: FirmwarePackageManifest | null,
    deviceLatest: string | null,
    currentVersion: string
  ): string {
    if (!entity) return 'Bootstrap required';
    if (!selectedPackage) return 'No package selected';
    if (selectedPackage.version === currentVersion) return 'No update';
    if (deviceLatest !== selectedPackage.version) return 'Run Check first';
    return 'Ready';
  }
</script>

<section class="updates-panel" aria-label={`${device.name} firmware updates`}>
  <div class="updates-header">
    <div>
      <h2>Firmware updates</h2>
      <p>{firmwareConfig?.projectName ?? 'Bootstrap required'}</p>
    </div>
    <div class="channel-control" aria-label="Firmware channel">
      <button
        type="button"
        class:active={selectedChannel === 'stable'}
        disabled={!firmwareConfig || channelPending}
        aria-pressed={selectedChannel === 'stable'}
        onclick={() => selectChannel('stable')}
      >
        Stable
      </button>
      <button
        type="button"
        class:active={selectedChannel === 'edge'}
        disabled={!firmwareConfig || channelPending}
        aria-pressed={selectedChannel === 'edge'}
        onclick={() => selectChannel('edge')}
      >
        Edge
      </button>
    </div>
  </div>

  {#if firmwareConfig}
    <dl class="version-grid">
      <div>
        <dt>Installed</dt>
        <dd>{installedVersion}</dd>
      </div>
      <div>
        <dt>Latest</dt>
        <dd>{lookupPending ? 'Checking' : latestVersion}</dd>
      </div>
      <div>
        <dt>Device state</dt>
        <dd>{updateState.state ?? 'Unknown'}</dd>
      </div>
      <div>
        <dt>Source SHA</dt>
        <dd>{packageInfo?.source_sha.slice(0, 12) ?? 'Unknown'}</dd>
      </div>
    </dl>

    {#if packageInfo?.release_summary || updateState.releaseSummary}
      <p class="summary">{packageInfo?.release_summary ?? updateState.releaseSummary}</p>
    {/if}

    {#if updateState.error}
      <p class="status error">{updateState.error}</p>
    {:else if lookupError}
      <p class="status error">{lookupError}</p>
    {:else if commandMessage}
      <p class="status">{commandMessage}</p>
    {:else if !updateEntity}
      <p class="status warn">Bootstrap required</p>
    {/if}

    <div class="actions">
      <button type="button" disabled={commandPending || !firmwareConfig} onclick={checkForUpdate}>
        {commandPending ? 'Working' : checkButton ? 'Check' : 'Refresh'}
      </button>
      <button type="button" class="apply" disabled={!canApply} title={canApply ? 'Apply firmware update' : applyBlockedReason} onclick={applyUpdate}>
        Apply
      </button>
      <small>{applyBlockedReason}</small>
    </div>
  {:else}
    <p class="status warn">Bootstrap required</p>
  {/if}
</section>

<style>
  .updates-panel {
    display: grid;
    gap: 14px;
    padding: 16px;
    border: 1px solid #d7ded9;
    border-radius: 8px;
    background: #ffffff;
  }

  .updates-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: start;
  }

  h2,
  p,
  dl {
    margin: 0;
  }

  h2 {
    font-size: 1.05rem;
  }

  .updates-header p,
  dt,
  small {
    color: #66736e;
  }

  .channel-control {
    display: grid;
    grid-template-columns: repeat(2, minmax(74px, 1fr));
    min-width: 160px;
    border: 1px solid #cad4ce;
    border-radius: 8px;
    overflow: hidden;
  }

  .channel-control button {
    border: 0;
    border-radius: 0;
    background: #f8faf9;
    color: #26342e;
  }

  .channel-control button + button {
    border-left: 1px solid #cad4ce;
  }

  .channel-control button.active {
    background: #1f6f54;
    color: #ffffff;
  }

  .version-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(118px, 1fr));
    gap: 10px;
  }

  .version-grid div {
    min-width: 0;
    padding: 10px;
    border: 1px solid #e0e7e2;
    border-radius: 8px;
    background: #f9fbfa;
  }

  dt {
    font-size: 0.72rem;
  }

  dd {
    margin: 4px 0 0;
    overflow-wrap: anywhere;
    font-weight: 700;
  }

  .summary,
  .status {
    padding: 10px 12px;
    border-radius: 8px;
    background: #f3f7f5;
    color: #33443c;
  }

  .status.warn {
    border: 1px solid #e7d49a;
    background: #fff9e6;
  }

  .status.error {
    border: 1px solid #e8c5c0;
    background: #fff7f5;
    color: #a62b24;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  button {
    min-height: 36px;
    padding: 0 12px;
    border: 1px solid #1f6f54;
    border-radius: 6px;
    background: #1f6f54;
    color: #ffffff;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }

  button.apply {
    border-color: #2454a6;
    background: #2454a6;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  @media (max-width: 920px) {
    .updates-header {
      display: grid;
    }

    .channel-control {
      width: min(100%, 260px);
    }

    .version-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 560px) {
    .version-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
