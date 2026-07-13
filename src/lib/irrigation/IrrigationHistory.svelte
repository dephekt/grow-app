<script lang="ts">
  import type { IrrigationEventJson } from '$lib/server/opensprinkler/events';

  let { events, timeZone = 'UTC' }: { events: IrrigationEventJson[]; timeZone?: string } = $props();

  // Feed spans days, so a run's timestamp carries date + wall-clock time, rendered in the
  // site/schedule zone (matching the "Next run" column above it) rather than the viewer's.
  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      timeZone,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function eventLabel(e: IrrigationEventJson): string {
    if (e.kind === 'runoff') return 'Runoff pump';
    return e.zoneName ?? (e.stationSid != null ? `Station ${e.stationSid}` : 'Zone');
  }

  function eventDetail(e: IrrigationEventJson): string {
    const parts: string[] = [];
    if (e.kind === 'irrigation') {
      if (e.requestedPercent != null) parts.push(`${e.requestedPercent}%`);
      else if (e.requestedMl != null) parts.push(`${e.requestedMl} mL`);
    }
    if (e.seconds != null) parts.push(`${e.seconds}s`);
    return parts.join(' · ');
  }

  // Wh: a 30 s pump run is ~0.5 Wh, a 5 min run ~5 Wh, so sub-1 gets an extra digit.
  function fmtEnergy(wh: number | null): string {
    if (wh == null) return '—';
    return `${wh.toFixed(wh < 1 ? 3 : 2)} Wh`;
  }
</script>

<div class="panel history">
  <div class="panel-head">
    <span class="panel-title">History</span>
    <span class="count mono">{events.length}</span>
  </div>

  {#if events.length === 0}
    <p class="empty mono">No irrigation history yet.</p>
  {:else}
    <ul class="rows">
      {#each events as e (e.id)}
        <li class="row" class:runoff={e.kind === 'runoff'}>
          <span class="dot" class:irrigation={e.kind === 'irrigation'} class:runoff={e.kind === 'runoff'}></span>
          <span class="when mono">{fmtTime(e.ts)}</span>
          <span class="what">
            <span class="label">{eventLabel(e)}</span>
            {#if eventDetail(e)}<span class="detail mono">{eventDetail(e)}</span>{/if}
            {#if e.source && e.source !== 'runoff'}<span class="src mono">{e.source}</span>{/if}
          </span>
          <span class="energy mono" class:faint={e.energyWh == null}>{fmtEnergy(e.energyWh)}</span>
          {#if e.noDraw}
            <span
              class="warn"
              role="img"
              aria-label="No pump draw detected during this run"
              title="No pump draw detected during this run — the tank may have served it, or the shot was too short to draw."
            >⚠</span>
          {:else}
            <span class="warn-spacer"></span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .history {
    /* Full-width row below the zones grid. */
    display: grid;
    gap: 4px;
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .panel-title {
    font-size: 0.92rem;
    color: var(--text);
  }
  .count {
    font-size: 0.68rem;
    color: var(--faint);
  }
  .empty {
    margin: 8px 0 0;
    color: var(--faint);
    font-size: 0.72rem;
  }
  .rows {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .row {
    display: grid;
    grid-template-columns: 8px minmax(96px, auto) 1fr auto 1.1em;
    gap: 12px;
    align-items: baseline;
    padding: 8px 2px;
    border-top: 1px solid var(--line);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    align-self: center;
    background: var(--faint);
  }
  .dot.irrigation {
    background: var(--amber);
  }
  .dot.runoff {
    /* Distinct from the amber irrigation runs — a neutral blue for the drain pump. */
    background: #4a9edb;
  }
  .when {
    font-size: 0.7rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .what {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .label {
    font-size: 0.8rem;
    color: var(--text);
  }
  .detail {
    font-size: 0.68rem;
    color: var(--muted);
  }
  .src {
    font-size: 0.56rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .energy {
    font-size: 0.74rem;
    color: var(--text);
    text-align: right;
    white-space: nowrap;
  }
  .energy.faint {
    color: var(--faint);
  }
  .warn {
    font-size: 0.82rem;
    color: var(--amber);
    text-align: center;
    cursor: help;
  }
  .warn-spacer {
    display: inline-block;
  }
</style>
