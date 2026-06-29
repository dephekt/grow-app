<script lang="ts">
  import type { LiveSnapshot } from '$lib/live-snapshot-context';
  import type { EntityConfig } from '$lib/server/mqtt/types';

  let { live } = $props<{ live: LiveSnapshot }>();

  // Recognise pumps / dosing circuits / relays — but NOT camera/thermal toggles
  // like "thermal_overlay_enable" or "roi_enabled", which are not circuits.
  const CIRCUIT_KEYWORDS = ['circuit', 'pump', 'relay', 'valve', 'dose', 'dosing', 'irrigation', 'runoff'];
  const EXCLUDE_KEYWORDS = ['thermal', 'roi', 'overlay', 'palette', 'camera'];

  function circuitKey(e: EntityConfig): string {
    return `${e.objectId ?? ''} ${e.name}`.toLowerCase();
  }

  let circuitEntities = $derived(
    live.snapshot.entities.filter((e: EntityConfig) => {
      if (e.component !== 'switch') return false;
      const key = circuitKey(e);
      return (
        CIRCUIT_KEYWORDS.some((kw) => key.includes(kw)) && !EXCLUDE_KEYWORDS.some((kw) => key.includes(kw))
      );
    })
  );

  function isOn(entity: EntityConfig): boolean {
    const state = live.stateFor(entity);
    return state.value === (entity.payloadOn ?? 'ON');
  }
</script>

<div class="panel circuits-panel">
  <div class="panel-head">
    <span class="panel-title">// CIRCUITS</span>
    <span class="mono count">{circuitEntities.length}</span>
  </div>

  {#if circuitEntities.length === 0}
    <p class="empty">No circuits</p>
  {:else}
    <div class="circuit-list">
      {#each circuitEntities as entity, i (entity.id)}
        {@const on = isOn(entity)}
        <div class="circuit-row" class:first={i === 0}>
          <span class="dot" class:ok={on}></span>
          <span class="circuit-label">{entity.name}</span>
          <span class="badge" class:badge-on={on} class:badge-off={!on}>{on ? 'ON' : 'OFF'}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .count {
    font-size: 0.72rem;
    color: var(--faint);
  }

  .circuit-list {
    display: flex;
    flex-direction: column;
  }

  .circuit-row {
    display: grid;
    grid-template-columns: 12px 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
  }

  .circuit-row:not(.first) {
    border-top: 1px solid var(--line);
  }

  .circuit-label {
    font-size: 0.85rem;
    color: var(--text);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: var(--r-pill);
    flex: none;
  }

  .badge-on {
    background: var(--ok);
    color: var(--bg);
  }

  .badge-off {
    border: 1px solid var(--line);
    color: var(--muted);
  }

  .empty {
    margin: 0;
    color: var(--faint);
    font-size: 0.85rem;
  }
</style>
