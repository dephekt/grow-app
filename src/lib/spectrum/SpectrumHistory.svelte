<script lang="ts">
  import Sparkline from '$lib/Sparkline.svelte';
  import type { CaptureSummary } from '$lib/server/spectrum/captures';

  let {
    captures,
    selectedId = null,
    onSelect
  }: { captures: CaptureSummary[]; selectedId?: string | null; onSelect: (id: string) => void } = $props();

  const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
</script>

<div class="panel history">
  <div class="panel-head">
    <span class="panel-title">// HISTORICAL READINGS</span>
    <span class="count mono">{captures.length}</span>
  </div>

  {#if captures.length === 0}
    <p class="empty">No saved readings yet — press Save on a live spectrum.</p>
  {:else}
    <ul class="rows">
      {#each captures as c (c.id)}
        <li>
          <button class="row" class:active={c.id === selectedId} onclick={() => onSelect(c.id)}>
            <span class="thumb"><Sparkline points={c.thumb} color="var(--amber)" width={120} height={30} /></span>
            <span class="ts mono">{fmtTime(c.capturedAt)}</span>
            <span class="ppfd mono">{c.ppfd == null ? '—' : c.ppfd.toFixed(0)}</span>
            {#if c.saturated}<span class="sat mono">SAT</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .panel-title {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .count {
    font-size: 0.68rem;
    color: var(--faint);
  }
  .empty {
    margin: 8px 0 0;
    color: var(--faint);
    font-size: 0.85rem;
  }
  .rows {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    /* When the card is height-constrained (beside the SPD chart) the list scrolls instead of
       stretching the card; min-height:0 lets a flex child actually shrink so overflow engages. */
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .row {
    width: 100%;
    display: grid;
    grid-template-columns: 120px 1fr auto auto;
    gap: 12px;
    align-items: center;
    padding: 8px 6px;
    background: none;
    border: none;
    border-top: 1px solid var(--line);
    color: var(--text);
    cursor: pointer;
    text-align: left;
  }
  .row:hover {
    background: var(--panel-2);
  }
  .row.active {
    background: var(--amber-dim);
  }
  .thumb {
    display: block;
  }
  .ts {
    font-size: 0.72rem;
    color: var(--muted);
  }
  .ppfd {
    font-size: 0.82rem;
    color: var(--text);
    text-align: right;
  }
  .sat {
    font-size: 0.6rem;
    color: var(--red, #d33);
    letter-spacing: 0.06em;
  }
</style>
