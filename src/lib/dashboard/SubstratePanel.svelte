<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Daniel Snider -->

<script lang="ts">
  import {
    DISPLAY_DIGITS,
    poreEcGap,
    vwcPercent,
    resolveSubstrateProbes,
    type BandStatus,
    type PoreEcGap,
    type SubstrateBand,
    type SubstrateProbe,
    type SubstrateProbeBinding,
    type SubstrateZoneBinding
  } from '$lib/substrate';
  import type { Snapshot } from '$lib/server/mqtt/types';

  // Values are formatted here at the sensor's own resolution; the publisher declares the
  // same precision for the two raw rows.
  let {
    snapshot,
    zones = [],
    probeBindings = []
  } = $props<{
    snapshot: Snapshot;
    zones?: SubstrateZoneBinding[];
    probeBindings?: SubstrateProbeBinding[];
  }>();

  let probes = $derived(resolveSubstrateProbes(snapshot, zones, probeBindings));

  // Selection is held by node id, not index, so a probe dropping off the bus doesn't
  // silently slide the tab onto a different pot.
  let selected = $state<string | null>(null);
  let active = $derived<SubstrateProbe | undefined>(
    probes.find((p: SubstrateProbe) => p.nodeId === selected) ?? probes[0]
  );

  const GAP_TEXT: Record<PoreEcGap, string> = {
    offline: 'probe offline',
    'no-reading': 'awaiting reading',
    'no-bulk-ec': 'probe reports no EC',
    'bad-bulk-ec': 'EC reading invalid',
    'too-dry': 'too dry to derive'
  };

  function pct(v: number | null): string {
    const p = vwcPercent(v);
    return p === null ? '—' : `${p.toFixed(DISPLAY_DIGITS.vwc)} %`;
  }
  function ec(v: number | null): string {
    return v === null ? '—' : `${v.toFixed(DISPLAY_DIGITS.poreEc)} mS/cm`;
  }
  function degrees(v: number | null): string {
    return v === null ? '—' : `${v.toFixed(DISPLAY_DIGITS.temperatureC)} °C`;
  }

  // With a band the dot means in-band; without one it falls back to liveness.
  function dot(status: BandStatus, live: boolean): string {
    if (status === 'unknown') return live ? 'ok' : '';
    return status === 'ok' ? 'ok' : 'alert';
  }

  // The band, rendered beside the value at that row's own precision.
  function bandText(band: SubstrateBand, unit: string, digits: number): string | null {
    const { min, max } = band;
    if (min === null && max === null) return null;
    const f = (v: number) => v.toFixed(digits);
    if (min !== null && max !== null) return `${f(min)}–${f(max)} ${unit}`;
    return min !== null ? `min ${f(min)} ${unit}` : `max ${f(max!)} ${unit}`;
  }

  let gap = $derived(active ? poreEcGap(active) : null);
  let vwcBand = $derived(
    active ? bandText(active.thresholds.vwcPct, '%', DISPLAY_DIGITS.vwc) : null
  );
  let poreBand = $derived(
    active ? bandText(active.thresholds.poreEc, 'mS/cm', DISPLAY_DIGITS.poreEc) : null
  );
  let tempBand = $derived(
    active ? bandText(active.thresholds.temperatureC, '°C', DISPLAY_DIGITS.temperatureC) : null
  );
  let badge = $derived(
    probes.length === 0 ? 'NOT CONNECTED' : active && !active.available ? 'OFFLINE' : null
  );
</script>

<div class="panel readout-panel" class:planned={probes.length === 0}>
  <div class="panel-head">
    <span class="title-unit"><span class="panel-title">// SUBSTRATE</span></span>
    <div class="head-right">
      {#if active}<span class="device-id mono">{active.nodeId}</span>{/if}
      {#if badge}<span class="badge mono" class:muted={badge === 'OFFLINE'}>{badge}</span>{/if}
    </div>
  </div>

  {#if probes.length > 1}
    <div class="probe-tabs" role="tablist">
      {#each probes as probe (probe.nodeId)}
        <button
          type="button"
          role="tab"
          aria-selected={probe.nodeId === active?.nodeId}
          class:active={probe.nodeId === active?.nodeId}
          class:offline={!probe.available}
          onclick={() => (selected = probe.nodeId)}
        >
          {probe.label}
        </button>
      {/each}
    </div>
  {/if}

  {#if !active}
    <p class="empty">No substrate probe discovered.</p>
  {:else}
    <div class="rows">
      <div class="row first">
        <span class="row-label">VWC</span>
        <span class="row-value mono">
          {pct(active.readings.vwc)}
          {#if vwcBand}<span class="band">{vwcBand}</span>{/if}
        </span>
        <span class="dot {dot(active.status.vwc, active.readings.vwc !== null)}"></span>
      </div>

      <!-- The number to steer on; bulk EC below is one of its inputs. -->
      <div class="row steer">
        <span class="row-label">pwEC</span>
        <span class="row-value mono">
          {#if active.readings.poreEc !== null}
            {ec(active.readings.poreEc)}
            {#if poreBand}<span class="band">{poreBand}</span>{/if}
          {:else}
            <span class="gap">— {gap ? GAP_TEXT[gap] : ''}</span>
          {/if}
        </span>
        <span class="dot {dot(active.status.poreEc, active.readings.poreEc !== null)}"></span>
      </div>

      <div class="row">
        <span class="row-label">Bulk EC</span>
        <span class="row-value mono">{ec(active.readings.bulkEc)}</span>
        <span class="dot {dot('unknown', active.readings.bulkEc !== null)}"></span>
      </div>
      <div class="row">
        <span class="row-label">Temp</span>
        <span class="row-value mono">
          {degrees(active.readings.temperatureC)}
          {#if tempBand}<span class="band">{tempBand}</span>{/if}
        </span>
        <span class="dot {dot(active.status.temperatureC, active.readings.temperatureC !== null)}"
        ></span>
      </div>
    </div>

    <!-- Both parts of the medium profile change the derived readings. -->
    <p class="foot">
      <span class="foot-key">Profile</span>
      {active.readings.calibrationProfile} · {active.readings.curve} VWC · ε₀ {active.readings
        .poreEcOffset}{#if active.readings.calibrationAssumed}<span class="assumed">
          · assumed</span
        >{:else}
        {' · from '}{active.substrateType}{/if}
    </p>
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
  .badge.muted {
    border-color: var(--line);
    color: var(--muted);
  }

  .probe-tabs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  .probe-tabs button {
    padding: 4px 10px;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    cursor: pointer;
  }
  .probe-tabs button:hover {
    color: var(--text);
    border-color: var(--line-strong);
  }
  .probe-tabs button.active {
    color: var(--amber);
    border-color: var(--amber);
    background: var(--amber-dim);
  }
  .probe-tabs button.offline {
    opacity: 0.55;
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

  /* The steering number carries the emphasis; every other row is an input to it. */
  .row.steer .row-label,
  .row.steer .row-value {
    color: var(--text);
  }
  .row.steer .row-value {
    font-weight: 600;
  }

  .gap {
    color: var(--faint);
    font-size: 0.76rem;
  }

  .band {
    margin-left: 8px;
    font-size: 0.68rem;
    color: var(--faint);
    white-space: nowrap;
  }

  .foot {
    margin: 12px 0 0;
    padding-top: 10px;
    border-top: 1px solid var(--line);
    font-size: 0.7rem;
    line-height: 1.5;
    color: var(--faint);
  }
  .foot-key {
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--muted);
  }
  .assumed {
    color: var(--amber);
  }

  .empty {
    margin: 0;
    color: var(--faint);
    font-size: 0.85rem;
  }
</style>
