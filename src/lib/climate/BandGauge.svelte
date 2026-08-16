<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Daniel Snider -->

<script lang="ts">
  import { AIR_VPD_HARD_MAX, AIR_VPD_HARD_MIN, type ControlBand } from '$lib/climate/model';

  let {
    band,
    airVpd,
    airVpdFast = null,
    leafVpd = null,
    ventedAirVpd = null
  }: {
    band: ControlBand;
    airVpd: number | null;
    /** The reading the band edges act on. The verdict beside this gauge is written from it, so
     *  the label has to agree with it or the two contradict each other during a vent run. */
    airVpdFast?: number | null;
    leafVpd?: number | null;
    ventedAirVpd?: number | null;
  } = $props();

  // Fixed domain so the band never appears to move between renders — a gauge whose axis
  // rescales is unreadable at a glance, which is the only thing this is for.
  const MIN = 0.2;
  const MAX = 1.8;
  const pct = (v: number) => ((Math.min(MAX, Math.max(MIN, v)) - MIN) / (MAX - MIN)) * 100;

  // Judged on the reading the loop judges on, not the median, so the gauge cannot read "in band"
  // at the moment the verdict beside it says the fan was released at the top.
  const edge = $derived(airVpdFast ?? airVpd);

  const state = $derived.by(() => {
    if (edge === null) return { label: 'no reading', tone: 'unknown' };
    if (edge < AIR_VPD_HARD_MIN) return { label: 'below the hard floor', tone: 'alert' };
    if (edge > AIR_VPD_HARD_MAX) return { label: 'above the hard ceiling', tone: 'alert' };
    if (edge < band.low) return { label: 'below band', tone: 'warn' };
    if (edge > band.high) return { label: 'above band', tone: 'warn' };
    return { label: 'in band', tone: 'ok' };
  });

  /** Shown only once the two have parted, which is during a vent run and nowhere else. */
  const diverged = $derived(airVpdFast !== null && airVpd !== null && Math.abs(airVpdFast - airVpd) >= 0.01);
</script>

<div class="gauge">
  <div class="head">
    <span class="value mono" class:alert={state.tone === 'alert'} class:warn={state.tone === 'warn'}>
      {edge === null ? '—' : edge.toFixed(2)}
    </span>
    <span class="unit mono">kPa air VPD</span>
    {#if diverged}<span class="unit mono">({airVpd!.toFixed(2)} median)</span>{/if}
    <span class="verdict mono {state.tone}">{state.label}</span>
  </div>

  <div class="track" role="img" aria-label="Air VPD {airVpd?.toFixed(2) ?? 'unknown'} against band {band.low}–{band.high} kPa">
    <div class="rail" style="left:{pct(AIR_VPD_HARD_MIN)}%; width:{pct(AIR_VPD_HARD_MAX) - pct(AIR_VPD_HARD_MIN)}%"></div>
    <div class="band" style="left:{pct(band.low)}%; width:{pct(band.high) - pct(band.low)}%"></div>
    <div class="target" style="left:{pct(band.target)}%"></div>

    {#if ventedAirVpd !== null}
      <div class="ghost" style="left:{pct(ventedAirVpd)}%" title="where venting would settle: {ventedAirVpd.toFixed(2)}"></div>
    {/if}
    {#if leafVpd !== null}
      <div class="leaf" style="left:{pct(leafVpd)}%" title="leaf VPD {leafVpd.toFixed(2)}"></div>
    {/if}
    {#if diverged}
      <div class="ghost" style="left:{pct(airVpd!)}%" title="5 min median {airVpd!.toFixed(2)}"></div>
    {/if}
    {#if edge !== null}
      <div class="needle {state.tone}" style="left:{pct(edge)}%"></div>
    {/if}
  </div>

  <div class="scale mono">
    <span style="left:{pct(AIR_VPD_HARD_MIN)}%">{AIR_VPD_HARD_MIN.toFixed(1)}</span>
    <span style="left:{pct(band.target)}%">{band.target.toFixed(2)}</span>
    <span style="left:{pct(AIR_VPD_HARD_MAX)}%">{AIR_VPD_HARD_MAX.toFixed(1)}</span>
  </div>

  <ul class="legend mono">
    <li><i class="k-band"></i>band {band.low.toFixed(2)}–{band.high.toFixed(2)}</li>
    <li><i class="k-rail"></i>hard rails {AIR_VPD_HARD_MIN.toFixed(1)}–{AIR_VPD_HARD_MAX.toFixed(1)}</li>
    {#if leafVpd !== null}<li><i class="k-leaf"></i>leaf {leafVpd.toFixed(2)}</li>{/if}
    {#if ventedAirVpd !== null}<li><i class="k-ghost"></i>vented {ventedAirVpd.toFixed(2)}</li>{/if}
  </ul>
</div>

<style>
  .gauge {
    display: grid;
    gap: 10px;
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .value {
    font-size: 2rem;
    color: var(--ok);
    line-height: 1;
  }
  .value.warn {
    color: var(--amber);
  }
  .value.alert {
    color: var(--alert);
  }
  .unit {
    font-size: 0.7rem;
    color: var(--muted);
    letter-spacing: 0.06em;
  }
  .verdict {
    margin-left: auto;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .verdict.ok {
    color: var(--ok);
  }
  .verdict.warn {
    color: var(--amber);
  }
  .verdict.alert {
    color: var(--alert);
  }

  .track {
    position: relative;
    height: 30px;
    border-radius: var(--r-control);
    background: var(--panel-2);
    border: 1px solid var(--line);
    overflow: hidden;
  }
  .rail,
  .band {
    position: absolute;
    top: 0;
    bottom: 0;
  }
  .rail {
    background: color-mix(in srgb, var(--ok) 10%, transparent);
  }
  .band {
    background: color-mix(in srgb, var(--ok) 26%, transparent);
    border-left: 1px solid color-mix(in srgb, var(--ok) 60%, transparent);
    border-right: 1px solid color-mix(in srgb, var(--ok) 60%, transparent);
  }
  .target {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: color-mix(in srgb, var(--ok) 70%, transparent);
  }

  .needle {
    position: absolute;
    top: -1px;
    bottom: -1px;
    width: 3px;
    margin-left: -1.5px;
    border-radius: 2px;
    background: var(--ok);
  }
  .needle.warn {
    background: var(--amber);
  }
  .needle.alert {
    background: var(--alert);
  }
  .needle.unknown {
    background: var(--faint);
  }

  .leaf,
  .ghost {
    position: absolute;
    width: 2px;
    margin-left: -1px;
  }
  /* Half-height so the two secondary markers never read as the controlled value. */
  .leaf {
    top: 55%;
    bottom: 0;
    background: var(--muted);
  }
  .ghost {
    top: 0;
    bottom: 55%;
    background: var(--faint);
  }

  .scale {
    position: relative;
    height: 12px;
    font-size: 0.62rem;
    color: var(--faint);
  }
  .scale span {
    position: absolute;
    transform: translateX(-50%);
    white-space: nowrap;
  }

  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-size: 0.64rem;
    color: var(--faint);
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .legend i {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  .k-band {
    background: color-mix(in srgb, var(--ok) 40%, transparent);
  }
  .k-rail {
    background: color-mix(in srgb, var(--ok) 14%, transparent);
  }
  .k-leaf {
    background: var(--muted);
  }
  .k-ghost {
    background: var(--faint);
  }
</style>
