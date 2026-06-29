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
  let packageLookupComplete = $state(false);
  let lookupError = $state('');
  let channelPending = $state(false);
  let commandPending = $state(false);
  let commandMessage = $state('');
  let actionMessage = $state('');
  let channelOverride = $state<FirmwareChannel | null>(null);
  let lastNodeId = $state<string | null>(null);
  let lastLookupKey = $state('');
  let requestId = 0;

  let nodeId = $derived(device.nodeId);
  let firmwareDevices = $derived(snapshot.firmware?.devices ?? {});
  let firmwareChannels = $derived(snapshot.firmware?.channels ?? {});
  let entities = $derived(snapshot.entities ?? []);
  let states = $derived(snapshot.states ?? {});
  let firmwareConfig = $derived(firmwareDevices[nodeId] ?? firmwareDevices[device.id] ?? null);
  let hasFirmwareConfig = $derived(Boolean(firmwareConfig));
  let channelConfig = $derived(firmwareChannels[nodeId] ?? null);
  let selectedChannel = $derived(channelOverride ?? channelConfig?.channel ?? 'stable');
  let deviceEntities = $derived(
    entities.filter((entity: EntityConfig) => entity.nodeId === nodeId || entity.device?.identifiers?.includes(nodeId))
  );
  let updateEntity = $derived(deviceEntities.find((entity: EntityConfig) => entity.component === 'update' && entity.commandTopic));
  let checkButton = $derived(
    deviceEntities.find((entity: EntityConfig) => {
      const value = `${entity.name} ${entity.objectId ?? ''}`.toLowerCase();
      return entity.component === 'button' && value.includes('firmware') && value.includes('check');
    })
  );
  let updateState = $derived(parseFirmwareUpdateState(updateEntity ? states[updateEntity.id]?.value : null));
  let installedVersion = $derived(
    firmwareConfig?.installedVersion ?? updateState.installedVersion ?? parseProjectVersion(device.swVersion) ?? 'Unknown'
  );
  let latestVersion = $derived(
    packageInfo?.version ?? (packageLookupComplete ? 'No package' : updateState.latestVersion ?? 'Unknown')
  );
  let updateStatus = $derived(deviceUpdateStatus(updateEntity, updateState, packageInfo, installedVersion));
  let changelogCommits = $derived(firmwareChangelogCommits(packageInfo?.changelog));
  let hasPackageUpdate = $derived(Boolean(packageInfo && packageInfo.version !== installedVersion));
  let releaseSummary = $derived(hasPackageUpdate ? packageInfo?.release_summary ?? updateState.releaseSummary ?? '' : '');
  let visibleChangelogCommits = $derived(hasPackageUpdate ? changelogCommits : []);
  let canApply = $derived(
    Boolean(
      updateEntity &&
        packageInfo &&
        packageInfo.version !== installedVersion &&
        updateState.latestVersion === packageInfo.version &&
        !commandPending
    )
  );
  let applyBlockedReason = $derived(applyReason(updateEntity, packageInfo, updateState.latestVersion, installedVersion, lookupPending));
  let actionStatus = $derived(actionMessage || applyBlockedReason);

  $effect(() => {
    if (lastNodeId !== nodeId) {
      lastNodeId = nodeId;
      channelOverride = null;
      commandMessage = '';
      actionMessage = '';
    }
  });

  $effect(() => {
    const lookupKey = hasFirmwareConfig ? `${nodeId}:${selectedChannel}` : '';
    if (!hasFirmwareConfig) {
      lastLookupKey = '';
      packageInfo = null;
      packageLookupComplete = false;
      lookupError = '';
      lookupPending = false;
      actionMessage = '';
      return;
    }
    if (lastLookupKey === lookupKey) return;
    lastLookupKey = lookupKey;
    void loadPackage(nodeId, selectedChannel);
  });

  async function loadPackage(currentNodeId: string, channel: FirmwareChannel): Promise<void> {
    const id = requestId + 1;
    requestId = id;
    lookupPending = true;
    packageLookupComplete = false;
    lookupError = '';
    actionMessage = '';

    try {
      const response = await fetch(`/api/firmware/devices/${encodeURIComponent(currentNodeId)}/package?channel=${channel}`);
      const body = (await response.json().catch(() => ({}))) as { package?: FirmwarePackageManifest | null; error?: string };

      if (requestId !== id) return;

      if (!response.ok) {
        packageInfo = null;
        lookupError = body.error ?? 'Package lookup failed';
        return;
      }

      packageInfo = body.package ?? null;
      packageLookupComplete = true;
    } catch (error) {
      if (requestId !== id) return;
      packageInfo = null;
      packageLookupComplete = false;
      lookupError = error instanceof Error ? error.message : 'Package lookup failed';
    } finally {
      if (requestId === id) lookupPending = false;
    }
  }

  async function selectChannel(channel: FirmwareChannel): Promise<void> {
    if (!firmwareConfig || channel === selectedChannel || channelPending) return;
    channelPending = true;
    commandMessage = '';
    actionMessage = '';

    try {
      const response = await fetch(`/api/firmware/devices/${encodeURIComponent(nodeId)}/channel`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        commandMessage = body.error ?? 'Channel update failed';
        return;
      }

      channelOverride = channel;
    } catch (error) {
      commandMessage = error instanceof Error ? error.message : 'Channel update failed';
    } finally {
      channelPending = false;
    }
  }

  async function checkForUpdate(): Promise<void> {
    if (!firmwareConfig || commandPending) return;
    commandPending = true;
    commandMessage = '';
    actionMessage = '';

    try {
      const response = await fetch(`/api/firmware/devices/${encodeURIComponent(nodeId)}/check`, { method: 'POST' });
      const body = (await response.json().catch(() => ({}))) as {
        package?: FirmwarePackageManifest | null;
        checkTriggered?: boolean;
        error?: string;
      };

      if (!response.ok) {
        commandMessage = body.error ?? 'Update check failed';
        return;
      }

      packageInfo = body.package ?? null;
      packageLookupComplete = true;
      if (!body.package || body.package.version === installedVersion) {
        actionMessage = 'No new package available';
        return;
      }
      actionMessage = body.checkTriggered ? 'Device check requested' : 'Package lookup refreshed';
    } catch (error) {
      commandMessage = error instanceof Error ? error.message : 'Update check failed';
    } finally {
      commandPending = false;
    }
  }

  async function applyUpdate(): Promise<void> {
    if (!packageInfo || !canApply || commandPending) return;
    commandPending = true;
    commandMessage = '';
    actionMessage = '';

    try {
      const response = await fetch(`/api/firmware/devices/${encodeURIComponent(nodeId)}/apply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: packageInfo.version })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      commandMessage = response.ok ? 'Install requested' : body.error ?? 'Install request failed';
    } catch (error) {
      commandMessage = error instanceof Error ? error.message : 'Install request failed';
    } finally {
      commandPending = false;
    }
  }

  function applyReason(
    entity: EntityConfig | undefined,
    selectedPackage: FirmwarePackageManifest | null,
    deviceLatest: string | null,
    currentVersion: string,
    pending: boolean
  ): string {
    if (pending) return 'Checking';
    if (!selectedPackage) return 'No package available';
    if (selectedPackage.version === currentVersion) return 'No update';
    if (!entity) return 'Update entity unavailable';
    if (deviceLatest !== selectedPackage.version) return 'Run Check first';
    return 'Ready';
  }

  function deviceUpdateStatus(
    entity: EntityConfig | undefined,
    state: ReturnType<typeof parseFirmwareUpdateState>,
    selectedPackage: FirmwarePackageManifest | null,
    currentVersion: string
  ): string {
    if (!entity) return 'Unavailable';
    if (state.error) return 'Error';
    if (state.state) return state.state;
    if (selectedPackage?.version === currentVersion) return 'Current';
    if (state.latestVersion && selectedPackage && state.latestVersion === selectedPackage.version) return 'Update ready';
    if (state.latestVersion) return 'Checked';
    return 'Idle';
  }

  function firmwareChangelogCommits(changelog: unknown): Array<{ sha: string; subject: string }> {
    if (!changelog || typeof changelog !== 'object' || Array.isArray(changelog)) return [];
    const commits = (changelog as { commits?: unknown }).commits;
    if (!Array.isArray(commits)) return [];

    return commits
      .map((commit) => {
        if (!commit || typeof commit !== 'object' || Array.isArray(commit)) return null;
        const raw = commit as { sha?: unknown; subject?: unknown };
        if (typeof raw.subject !== 'string' || raw.subject.length === 0) return null;
        return {
          sha: typeof raw.sha === 'string' ? raw.sha : '',
          subject: raw.subject
        };
      })
      .filter((commit): commit is { sha: string; subject: string } => Boolean(commit));
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
        <dd>{updateStatus}</dd>
      </div>
      <div>
        <dt>Source SHA</dt>
        <dd>{packageInfo?.source_sha.slice(0, 12) ?? 'Unknown'}</dd>
      </div>
    </dl>

    {#if releaseSummary || visibleChangelogCommits.length > 0}
      <div class="release-notes">
        {#if releaseSummary}
          <p class="summary">{releaseSummary}</p>
        {/if}

        {#if visibleChangelogCommits.length > 0}
          <ul class="changelog" aria-label="Firmware changelog">
            {#each visibleChangelogCommits as commit (`${commit.sha}:${commit.subject}`)}
              <li>
                <span>{commit.subject}</span>
                {#if commit.sha}
                  <code>{commit.sha.slice(0, 12)}</code>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}

    {#if updateState.error}
      <p class="status error">{updateState.error}</p>
    {:else if lookupError}
      <p class="status error">{lookupError}</p>
    {:else if commandMessage}
      <p class="status">{commandMessage}</p>
    {:else if !updateEntity && packageInfo?.version !== installedVersion}
      <p class="status warn">Update entity unavailable</p>
    {/if}

    <div class="actions">
      <button type="button" disabled={commandPending || !firmwareConfig} onclick={checkForUpdate}>
        {commandPending ? 'Working' : checkButton ? 'Check' : 'Refresh'}
      </button>
      <button type="button" class="apply" disabled={!canApply} title={canApply ? 'Apply firmware update' : applyBlockedReason} onclick={applyUpdate}>
        Apply
      </button>
      <small>{actionStatus}</small>
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
    border: 1px solid var(--line);
    border-radius: var(--r-panel);
    background: var(--panel);
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
    color: var(--muted);
  }

  .channel-control {
    display: grid;
    grid-template-columns: repeat(2, minmax(74px, 1fr));
    min-width: 160px;
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    overflow: hidden;
  }

  .channel-control button {
    border: 0;
    border-radius: 0;
    background: var(--panel-2);
    color: var(--text);
  }

  .channel-control button + button {
    border-left: 1px solid var(--line);
  }

  .channel-control button.active {
    background: var(--amber-dim);
    color: var(--amber);
  }

  .version-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(118px, 1fr));
    gap: 10px;
  }

  .version-grid div {
    min-width: 0;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    background: var(--panel-2);
  }

  dt {
    font-size: 0.72rem;
  }

  dd {
    margin: 4px 0 0;
    overflow-wrap: anywhere;
    font-weight: 700;
  }

  .release-notes {
    display: grid;
    gap: 8px;
  }

  .summary,
  .status {
    padding: 10px 12px;
    border-radius: var(--r-control);
    background: var(--panel-2);
    color: var(--text);
  }

  .changelog {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .changelog li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: baseline;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    background: var(--panel-2);
  }

  .changelog span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .changelog code {
    color: var(--muted);
    font: inherit;
    font-size: 0.78rem;
  }

  .status.warn {
    border: 1px solid var(--amber);
    background: var(--amber-dim);
    color: var(--amber);
  }

  .status.error {
    border: 1px solid var(--alert);
    background: var(--panel-2);
    color: var(--alert);
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
    border: 1px solid var(--amber);
    border-radius: var(--r-control);
    background: var(--amber-dim);
    color: var(--amber);
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }

  button.apply {
    border-color: var(--cyan);
    background: var(--panel-2);
    color: var(--cyan);
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
