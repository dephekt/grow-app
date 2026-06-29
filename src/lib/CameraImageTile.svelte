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
    intervalMs = 2000,
    controlsCollapsible = false,
    showLabel = true
  } = $props<{
    entry: PresentedEntity;
    controls?: PresentedEntity[];
    states?: Record<string, EntityState>;
    commandPending?: Record<string, boolean>;
    commandErrors?: Record<string, string>;
    onCommand?: (entity: EntityConfig, value?: unknown) => void;
    available?: boolean;
    intervalMs?: number;
    /** Tuck the controls behind a drawer, closed by default (dashboard tile). */
    controlsCollapsible?: boolean;
    /** Show the camera name (header + caption). Off when an enclosing panel already
        titles it (e.g. the dashboard `// THERMAL` panel), to avoid repeating the name. */
    showLabel?: boolean;
  }>();

  let controlsOpen = $state(false);
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
  <div class="tile-header" class:meta-only={!showLabel}>
    {#if showLabel}
      <h3>{entry.label}</h3>
    {/if}
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

  {#if showLabel}
    <p class="caption">{entry.entity.name}</p>
  {/if}

  {#if controls.length > 0}
    {#if controlsCollapsible}
      <div class="controls-drawer">
        <button
          type="button"
          class="drawer-toggle"
          aria-expanded={controlsOpen}
          onclick={() => (controlsOpen = !controlsOpen)}
        >
          <span>Controls</span>
          <span class="chev" class:open={controlsOpen} aria-hidden="true">▸</span>
        </button>
        {#if controlsOpen}
          <ThermalCameraControls {controls} {states} {commandPending} {commandErrors} {onCommand} />
        {/if}
      </div>
    {:else}
      <ThermalCameraControls {controls} {states} {commandPending} {commandErrors} {onCommand} />
    {/if}
  {/if}
</div>

<style>
  .camera-tile {
    border: 1px solid var(--line);
    border-radius: var(--r-panel);
    background: var(--panel);
    overflow: hidden;
  }

  .tile-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    font-weight: bold;
  }

  /* Name suppressed (panel titles it) — keep just the freshness stamp, right-aligned. */
  .tile-header.meta-only {
    justify-content: flex-end;
  }

  .tile-header h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .updated {
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: normal;
  }

  .image-area {
    width: 100%;
    aspect-ratio: 4 / 3;
    background: var(--panel-2);
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
    color: var(--muted);
    font-size: 0.9rem;
  }

  .caption {
    margin: 0;
    padding: 8px 16px;
    color: var(--muted);
    font-size: 0.78rem;
    border-top: 1px solid var(--line);
  }

  .controls-drawer {
    border-top: 1px solid var(--line);
  }

  .drawer-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 16px;
    min-height: var(--tap);
    background: transparent;
    border: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .drawer-toggle:hover {
    color: var(--text);
  }

  .chev {
    transition: transform 0.12s ease;
    color: var(--faint);
  }
  .chev.open {
    transform: rotate(90deg);
    color: var(--amber);
  }
</style>
