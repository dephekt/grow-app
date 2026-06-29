<script lang="ts">
  import CameraImageTile from '$lib/CameraImageTile.svelte';
  import { dashboardPresentation } from '$lib/device-presentation';
  import type { LiveSnapshot } from '$lib/live-snapshot-context';
  import type { DeviceSnapshot, EntityConfig } from '$lib/server/mqtt/types';

  let { live } = $props<{ live: LiveSnapshot }>();

  let cameraDevice = $derived(
    live.snapshot.devices.find((d: DeviceSnapshot) =>
      d.entityIds.some((id: string) => {
        const e = live.snapshot.entities.find((en: EntityConfig) => en.id === id);
        return e?.component === 'camera';
      })
    )
  );

  let cameras = $derived(
    cameraDevice ? dashboardPresentation(live.snapshot, cameraDevice).cameras : []
  );

  let camera = $derived(cameras[0] ?? null);
  let deviceAvailable = $derived(cameraDevice?.availability !== 'offline');
</script>

<div class="panel thermal-panel">
  <div class="panel-head">
    <span class="panel-title">// THERMAL</span>
    {#if cameraDevice?.model}
      <span class="device-id mono">{cameraDevice.model}</span>
    {/if}
  </div>

  {#if camera}
    <!-- Curated thermal shape: tile + its quick controls (palette / overlay / ROI),
         which are dashboard-surface entities. -->
    <CameraImageTile
      entry={camera.entry}
      controls={camera.quickControls}
      controlsCollapsible={true}
      states={live.snapshot.states}
      commandPending={live.commandPending}
      commandErrors={live.commandErrors}
      onCommand={live.sendCommand}
      available={deviceAvailable}
    />
  {:else}
    <p class="empty">No thermal camera</p>
  {/if}
</div>

<style>
  .device-id {
    font-size: 0.7rem;
    color: var(--faint);
  }

  .empty {
    margin: 0;
    color: var(--faint);
    font-size: 0.85rem;
  }
</style>
