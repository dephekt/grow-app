<script lang="ts">
  import ThermalCameraControls from '$lib/ThermalCameraControls.svelte';
  import type { PresentedEntity } from '$lib/device-presentation';
  import type { EntityConfig, EntityState } from '$lib/server/mqtt/types';

  let {
    entry,
    controls = [],
    states = {},
    commandPending = {},
    commandErrors = {},
    onCommand = () => {},
    available = true,
    intervalMs = 2000
  } = $props<{
    entry: PresentedEntity;
    controls?: PresentedEntity[];
    states?: Record<string, EntityState>;
    commandPending?: Record<string, boolean>;
    commandErrors?: Record<string, string>;
    onCommand?: (entity: EntityConfig, value?: unknown) => void;
    available?: boolean;
    intervalMs?: number;
  }>();

  let tick = $state(0);
  let failed = $state(false);
  let updatedAt = $state<Date | null>(null);

  const src = $derived(`/api/entities/${encodeURIComponent(entry.entity.id)}/image?t=${tick}`);

  $effect(() => {
    const id = setInterval(() => {
      tick += 1;
    }, intervalMs);
    return () => clearInterval(id);
  });
</script>

<div class="camera-tile">
  <div class="tile-header">
    <h3>{entry.label}</h3>
    <span class="updated">updated {updatedAt ? updatedAt.toLocaleTimeString() : '—'}</span>
  </div>

  <div class="image-area">
    {#if available}
      <img
        {src}
        alt={entry.label}
        class:hidden={failed}
        onload={() => {
          failed = false;
          updatedAt = new Date();
        }}
        onerror={() => {
          failed = true;
        }}
      />
    {/if}
    {#if !available || failed}
      <div class="offline-placeholder" aria-label="Camera offline">Camera offline</div>
    {/if}
  </div>

  <p class="caption">{entry.entity.name}</p>

  {#if controls.length > 0}
    <ThermalCameraControls {controls} {states} {commandPending} {commandErrors} {onCommand} />
  {/if}
</div>

<style>
  .camera-tile {
    border: 1px solid #d7ded9;
    border-radius: 8px;
    background: #ffffff;
    overflow: hidden;
  }

  .tile-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    font-weight: bold;
  }

  .tile-header h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .updated {
    color: #66736e;
    font-size: 0.75rem;
    font-weight: normal;
  }

  .image-area {
    width: 100%;
    aspect-ratio: 4 / 3;
    background: #f0f4f1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .image-area img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .image-area img.hidden {
    display: none;
  }

  .offline-placeholder {
    color: #66736e;
    font-size: 0.9rem;
  }

  .caption {
    margin: 0;
    padding: 8px 16px;
    color: #66736e;
    font-size: 0.78rem;
    border-top: 1px solid #e5ebe7;
  }
</style>
