<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Daniel Snider -->

<script lang="ts">
  import type { ClimateEventJson } from '$lib/server/climate/store';

  let {
    events,
    total,
    anchorId,
    pageSize,
    onpage
  }: {
    events: ClimateEventJson[];
    total: number;
    anchorId: number;
    pageSize: number;
    /** Resolves false when the page could not be fetched, so the pager does not advance. */
    onpage: (offset: number) => Promise<boolean>;
  } = $props();

  let offset = $state(0);
  let busy = $state(false);

  const pages = $derived(Math.max(1, Math.ceil(total / pageSize)));
  const pageNo = $derived(Math.floor(offset / pageSize) + 1);

  async function go(next: number): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      // Only on success: advancing regardless would show "Page 2" above page 1's rows.
      if (await onpage(next)) offset = next;
    } finally {
      busy = false;
    }
  }

  function stamp(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
  }

  /** Verdict label; `published: false` is the dry run's whole point, so it is called out. */
  function verdict(e: ClimateEventJson): string {
    switch (e.kind) {
      case 'exhaust':
        return `${e.published ? 'exhaust' : 'would set exhaust'} ${e.on ? 'ON' : 'OFF'}`;
      case 'humidify':
        return `${e.published ? 'humidifier' : 'would set humidifier'} ${e.on ? 'ON' : 'OFF'}`;
      // Direction matters most here: wanting to STOP venting is the over-venting case the dry
      // run exists to surface, and it would otherwise read the same as wanting to start.
      case 'delegated':
        return `delegated · ${e.actuator} ${e.on ? 'ON' : 'OFF'}`;
      case 'blocked':
        return `blocked · ${e.actuator} ${e.on ? 'ON' : 'OFF'}`;
      default:
        return 'hold';
    }
  }

  function tone(e: ClimateEventJson): string {
    if (e.kind === 'blocked') return 'alert';
    if (e.kind === 'delegated') return 'warn';
    if (e.kind === 'exhaust' || e.kind === 'humidify') return e.published ? 'ok' : 'dry';
    return 'muted';
  }

  const num = (v: number | null, digits = 2) => (v === null ? '—' : v.toFixed(digits));
</script>

<div class="log">
  {#if events.length === 0}
    <p class="empty">No decisions recorded yet. The loop writes a row whenever its verdict changes, and a heartbeat every 15 minutes.</p>
  {:else}
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Verdict</th>
            <th>Air VPD</th>
            <th>Band</th>
            <th>Tent</th>
            <th>Room</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {#each events as e (e.id)}
            <tr>
              <td class="mono nowrap">{stamp(e.ts)}</td>
              <td class="nowrap"><span class="verdict {tone(e)}">{verdict(e)}</span></td>
              <td class="mono">{num(e.airVpd)}{#if e.leafVpd !== null}<span class="sub"> / {num(e.leafVpd)} leaf</span>{/if}</td>
              <td class="mono sub nowrap">{num(e.bandLow)}–{num(e.bandHigh)}</td>
              <td class="mono sub nowrap">{num(e.tentTempC, 1)}°C {num(e.tentRhPct, 0)}%</td>
              <td class="mono sub nowrap">{num(e.roomTempC, 1)}°C {num(e.roomRhPct, 0)}%</td>
              <td class="reason">{e.reason}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if pages > 1}
      <div class="pager">
        <button class="ctl" disabled={busy || offset === 0} onclick={() => go(Math.max(0, offset - pageSize))}>
          ← Newer
        </button>
        <span class="mono">Page {pageNo} of {pages} · {total} decisions</span>
        <button
          class="ctl"
          disabled={busy || offset + pageSize >= total}
          onclick={() => go(offset + pageSize)}
        >
          Older →
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .empty {
    margin: 0;
    font-size: 0.8rem;
    color: var(--faint);
  }

  /* The table is wide by nature; it scrolls inside the panel rather than the page. */
  .scroll {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.78rem;
  }
  th {
    text-align: left;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    padding: 0 12px 7px 0;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  td {
    padding: 7px 12px 7px 0;
    border-bottom: 1px solid var(--line);
    color: var(--text);
    vertical-align: top;
  }
  .nowrap {
    white-space: nowrap;
  }
  .sub {
    color: var(--muted);
  }
  .reason {
    color: var(--muted);
    min-width: 22ch;
  }

  .verdict {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
  }
  .verdict.ok {
    color: var(--ok);
  }
  .verdict.dry {
    color: var(--muted);
    font-style: italic;
  }
  .verdict.warn {
    color: var(--amber);
  }
  .verdict.alert {
    color: var(--alert);
  }
  .verdict.muted {
    color: var(--faint);
  }

  .pager {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-top: 12px;
    font-size: 0.72rem;
    color: var(--muted);
  }
  .ctl {
    min-height: 32px;
    padding: 4px 12px;
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    background: var(--panel-2);
    color: var(--muted);
    cursor: pointer;
    font-size: 0.76rem;
    font-weight: 600;
  }
  .ctl:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
