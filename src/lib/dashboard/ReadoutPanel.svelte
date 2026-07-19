<script lang="ts">
  let {
    title,
    unit,
    rows = [],
    deviceId,
    planned = false,
    badge,
    badgeTone = 'amber'
  } = $props<{
    title: string;
    unit?: string;
    rows?: Array<{ label: string; value: string; status?: 'ok' | 'warn' | 'alert' | 'none' }>;
    deviceId?: string;
    planned?: boolean;
    badge?: string;
    badgeTone?: 'amber' | 'ok' | 'muted';
  }>();
</script>

<div class="panel readout-panel" class:planned>
  <div class="panel-head">
    <span class="title-unit">
      <span class="panel-title">// {title}</span>
      {#if unit}<span class="unit mono">{unit}</span>{/if}
    </span>
    <div class="head-right">
      {#if deviceId}
        <span class="device-id mono">{deviceId}</span>
      {/if}
      {#if badge || planned}
        <span class="badge mono {badgeTone}">{badge ?? 'PLANNED'}</span>
      {/if}
    </div>
  </div>

  {#if rows.length === 0}
    <p class="empty">No data</p>
  {:else}
    <div class="rows">
      {#each rows as row, i}
        <div class="row" class:first={i === 0}>
          <span class="row-label">{row.label}</span>
          <span class="row-value mono">{row.value}</span>
          {#if row.status && row.status !== 'none'}
            <span class="dot {row.status}"></span>
          {:else}
            <span class="dot-spacer"></span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .readout-panel.planned {
    border-style: dashed;
    opacity: 0.88;
  }

  .title-unit {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .unit {
    font-size: 0.62rem;
    color: var(--faint);
    letter-spacing: 0.03em;
  }

  .head-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .device-id {
    font-size: 0.68rem;
    color: var(--faint);
  }

  .badge {
    font-size: 0.62rem;
    font-weight: 600;
    padding: 2px 6px;
    border: 1px solid var(--amber);
    border-radius: var(--r-pill);
    color: var(--amber);
    letter-spacing: 0.06em;
    white-space: nowrap;
  }
  .badge.ok {
    border-color: var(--green, #3a9d7f);
    color: var(--green, #3a9d7f);
  }
  .badge.muted {
    border-color: var(--line);
    color: var(--muted);
  }

  .rows {
    display: flex;
    flex-direction: column;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr auto 16px;
    gap: 8px 12px;
    align-items: center;
    padding: 9px 0;
  }

  .row:not(.first) {
    border-top: 1px solid var(--line);
  }

  .row-label {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--muted);
    text-transform: uppercase;
  }

  .row-value {
    font-size: 0.88rem;
    color: var(--text);
    text-align: right;
  }

  .dot-spacer {
    display: block;
    width: 8px;
    height: 8px;
  }

  .empty {
    margin: 0;
    color: var(--faint);
    font-size: 0.85rem;
  }
</style>
