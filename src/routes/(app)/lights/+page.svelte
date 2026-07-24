<script lang="ts">
  import { untrack } from 'svelte';
  import { getLiveSnapshot } from '$lib/live-snapshot-context';
  import type { CaptureDetail, CaptureSummary } from '$lib/server/spectrum/captures';
  import { processSpectrum, luxToPpfd, type SpectrumView, type SpectroConfig } from '$lib/spectrum/calibration';
  import { entityByRef, photoperiodHours } from '$lib/lights/model';
  import { resolveGrowState } from '$lib/lights/grow-plan';
  import { shareRows, shareTitle } from '$lib/spectrum/readout-rows';
  import { liveQuantumPpfd, hasQuantumPpfd } from '$lib/entity-match';
  import { resolveCanopy } from '$lib/lights/canopy';
  import SpdChart from '$lib/spectrum/SpdChart.svelte';
  import SpectrumHistory from '$lib/spectrum/SpectrumHistory.svelte';
  import ReadoutPanel from '$lib/dashboard/ReadoutPanel.svelte';
  import LightControl from '$lib/lights/LightControl.svelte';
  import GrowPlanCard from '$lib/lights/GrowPlanCard.svelte';

  type Anchors = SpectroConfig['anchors'];

  let { data } = $props();
  const live = getLiveSnapshot();

  // The grow plan resolves off the wall clock; captured once so SSR/hydration agree within the week.
  const growState = resolveGrowState(new Date());

  const lights = $derived(live.snapshot.lights ?? []);
  const primaryLight = $derived(lights[0] ?? null);
  const extraLights = $derived(lights.slice(1));

  const anchors = $state<Anchors>(untrack(() => data.anchors));

  // The fixture duty (GP8413 DAC) drives the grow-plan guidance (distance/dimmer suggestion).
  const dimmerEntity = $derived(primaryLight ? entityByRef(live.snapshot, primaryLight.roles.dimmer) : undefined);
  const dimmerPct = $derived.by(() => {
    if (!dimmerEntity) return null;
    const raw = live.stateFor(dimmerEntity).value;
    const n = Number(raw);
    return raw != null && raw !== '' && Number.isFinite(n) ? n : null;
  });

  // The light's actual photoperiod (from its schedule) — the grow plan flags when it drifts from the
  // stage target (e.g. still on the seedling 18/6 while the plan wants veg 20/4).
  const actualPhotoperiod = $derived.by(() => {
    if (!primaryLight) return null;
    const onE = entityByRef(live.snapshot, primaryLight.roles.onTime);
    const offE = entityByRef(live.snapshot, primaryLight.roles.offTime);
    if (!onE || !offE) return null;
    return photoperiodHours(live.stateFor(onE).value, live.stateFor(offE).value);
  });

  // Fleet illuminance (DLight/BH1750) — provenance shown on the canopy card when there's no Apogee.
  const liveLux = $derived.by(() => {
    const snap = live.snapshot;
    const ent = snap?.entities?.find((e) => e.deviceClass === 'illuminance' || e.unit === 'lx');
    if (!ent) return null;
    const raw = snap.states[ent.id]?.value;
    const lux = Number(raw);
    return raw != null && Number.isFinite(lux) ? lux : null;
  });

  // The Apogee SQ-521 quantum sensor — a DIRECT canopy PPFD measurement (the DLight lux above is
  // only an estimate). Drives the Canopy PPFD card as ground truth; null when the publisher is
  // offline (so its retained value can't linger) or in darkness noise (clamped to 0).
  const liveApogeePpfd = $derived(liveQuantumPpfd(live.snapshot));

  // ── Spectrum (merged in from the retired /spectrum page) ──
  const VIEWS: SpectrumView[] = ['photon', 'energy', 'raw'];
  const VIEW_HINT: Record<SpectrumView, string> = {
    photon: 'µmol — photon flux',
    energy: 'W/nm — radiant power',
    raw: 'sensor counts, uncorrected'
  };
  let view = $state<SpectrumView>('photon');

  const liveSpectrum = $derived(live.spectrumReceived ? live.spectrum : data.initialSpectrum);

  let captures = $state<CaptureSummary[]>(untrack(() => data.captures));
  let selected = $state<CaptureDetail | null>(null);
  let saving = $state(false);
  let saveError = $state<string | null>(null);

  // Once the columns stack, the saved-readings card turns into a collapsed drawer so a long history
  // doesn't dominate the scroll on a phone (it's rarely what you open the Lights page for). matchMedia
  // keeps this on exactly the same breakpoint as the stylesheet below.
  // Initialise synchronously (SSR-guarded) so the first client paint is already correct — the (app)
  // group is ssr=false, so there's no server HTML, and this avoids painting the card expanded then
  // collapsing it (a layout shift) on a phone.
  let stacked = $state(typeof window !== 'undefined' && window.matchMedia('(max-width: 980px)').matches);
  $effect(() => {
    const mq = window.matchMedia('(max-width: 980px)');
    const apply = () => (stacked = mq.matches);
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  });

  // Open a saved reading if selected, else the live frame — carry RAW counts so the view toggle
  // reprocesses client-side (calibration is a pure module) with no round-trip.
  const source = $derived(
    selected
      ? {
          counts: selected.counts,
          adcBits: selected.adcBits ?? 14,
          integrationUs: selected.integrationUs ?? 0,
          saturated: selected.saturated
        }
      : liveSpectrum
        ? {
            counts: liveSpectrum.counts,
            adcBits: liveSpectrum.adcBits,
            integrationUs: liveSpectrum.integrationUs,
            saturated: liveSpectrum.saturated
          }
        : null
  );
  const active = $derived(
    source
      ? processSpectrum(source.counts, {
          view,
          adcFullScale: (1 << source.adcBits) - 1,
          integrationUs: source.integrationUs,
          saturated: source.saturated,
          // Live frames get the DLight lux for a frame-robust PPFD; a saved capture keeps its own
          // frame-based value (the current lux doesn't belong to a past reading).
          liveLux: selected ? undefined : (liveLux ?? undefined),
          config: { anchors }
        })
      : null
  );

  // PAR estimated from a DLight's lux via the µmol/lux factor banked in the stored lux anchor — see
  // luxToPpfd. Works with the spectrometer absent, but not without an anchor to supply the factor.
  const luxParEstimate = $derived(luxToPpfd(liveLux, anchors.lux));

  // Canopy PAR resolved by descending trust (saved reading → live Apogee → DLight-lux estimate →
  // unavailable); see resolveCanopy. hasQuantumPpfd separates "sensor offline" from "no sensor".
  const canopy = $derived(
    resolveCanopy({
      selected: selected != null,
      apogeePpfd: liveApogeePpfd,
      luxPar: luxParEstimate,
      active,
      luxAnchor: anchors.lux,
      hasQuantumSensor: hasQuantumPpfd(live.snapshot)
    })
  );
  const livePpfd = $derived(canopy.par);
  const canopyEpar = $derived(canopy.epar);
  const deltaPct = $derived(livePpfd != null ? ((livePpfd - growState.ppfdTarget) / growState.ppfdTarget) * 100 : null);
  const fillPct = $derived(livePpfd != null ? Math.max(0, Math.min(100, (livePpfd / growState.ppfdTarget) * 100)) : 0);

  async function refetchList() {
    const res = await fetch('/api/spectrum');
    if (res.ok) captures = ((await res.json()) as { captures: CaptureSummary[] }).captures;
  }

  async function save() {
    saving = true;
    saveError = null;
    try {
      const res = await fetch('/api/spectrum', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!res.ok) {
        saveError = res.status === 404 ? 'No live spectrum to save yet' : 'Save failed';
        return;
      }
      await refetchList();
    } catch {
      saveError = 'Save failed';
    } finally {
      saving = false;
    }
  }

  async function openCapture(id: string) {
    const res = await fetch(`/api/spectrum/${id}`);
    if (res.ok) selected = ((await res.json()) as { capture: CaptureDetail }).capture;
  }
  function backToLive() {
    selected = null;
  }
</script>

<svelte:head>
  <title>Lights · {live.snapshot.site}</title>
  <meta name="description" content="Grow light — live canopy PPFD, spectrum, fixture control, photoperiod, and the weekly light plan" />
</svelte:head>

<div class="lights-page">
  <!-- ── Row 1: Spectrometer — SPD chart + saved readings ── -->
  <span class="section-label">Spectrometer · C12880MA</span>
  <section class="grid12 row-stretch">
    <div class="c8">
      <div class="panel">
        <div class="chart-head">
          <span class="panel-title mono-title">// SPECTRAL POWER DISTRIBUTION{selected ? ' · SAVED READING' : ' · LIVE'}</span>
          <div class="actions">
            <div class="views" role="group" aria-label="Spectrum view">
              {#each VIEWS as v}
                <button class="vbtn" class:on={view === v} onclick={() => (view = v)}>{v}</button>
              {/each}
            </div>
            {#if selected}
              <button class="btn" onclick={backToLive}>← Live</button>
            {:else}
              <button class="btn primary" onclick={save} disabled={saving || !liveSpectrum}>
                {saving ? 'Saving…' : 'Save reading'}
              </button>
            {/if}
          </div>
        </div>
        <p class="vhint">{view} · {VIEW_HINT[view]}</p>
        {#if active}
          <SpdChart relative={active.relative} saturated={active.saturated} peaks={active.peaks} />
        {:else}
          <p class="empty">Waiting for the spectrometer to publish a frame…</p>
        {/if}
        {#if saveError}<p class="err mono">{saveError}</p>{/if}
      </div>
    </div>

    <div class="c4 hist-fill">
      <SpectrumHistory {captures} selectedId={selected?.id ?? null} onSelect={openCapture} collapsible={stacked} />
    </div>
  </section>

  <!-- ── Row 2: Canopy PPFD · spectrum share · main light ── -->
  <span class="section-label">Live canopy output · light control</span>
  <section class="grid12">
    <div class="c4">
      <div class="panel stat primary">
        <div class="eyebrow">
          <span class="dot {canopy.dot}"></span>
          <span class="panel-title">Canopy PAR</span>
          {#if canopy.badge}<span class="badge {canopy.badge.tone}">{canopy.badge.text}</span>{/if}
        </div>
        <div class="val">
          {canopy.par == null ? '—' : `${canopy.prefix}${canopy.par.toFixed(0)}`}<span class="unit">µmol·m⁻²·s⁻¹</span>
        </div>
        <div class="sub">
          {canopy.tol != null ? `±${canopy.tol.toFixed(0)}% · ` : ''}{canopy.provenance}
        </div>
        <div class="flux-mini">
          <div class="kv">
            <span class="k">ePAR (C12880MA)</span>
            <span class="v">
              {#if canopyEpar == null}<span class="none">unavailable</span>{:else}{canopyEpar.toFixed(0)}{/if}
            </span>
          </div>
        </div>
        <div class="tgt-row">
          <span class="tgt-lab">{growState.stage.label} {growState.ppfdTarget}</span>
          <div class="bar"><i style="width: {fillPct}%;"></i></div>
          {#if deltaPct != null}<span class="delta mono" class:neg={deltaPct < 0} class:pos={deltaPct >= 0}>{deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(0)}%</span>{/if}
        </div>
      </div>
    </div>

    <div class="c4">
      <ReadoutPanel title={active ? shareTitle(active).replace('SPECTRUM · ', 'Spectrum · ') : 'Spectrum · photon share'} rows={active ? shareRows(active) : []} />
    </div>

    <div class="c4">
      {#if primaryLight}
        <LightControl light={primaryLight} {live} stageLabel={growState.stage.label} />
      {:else}
        <div class="panel empty-control">
          <span class="panel-title">Grow Light</span>
          <p class="muted">
            No light configured yet. A device announces one by publishing a <code>grow-lights.v1</code>
            fragment to <code>&lt;node&gt;/_lights/config</code>.
          </p>
        </div>
      {/if}
    </div>
  </section>

  {#if extraLights.length > 0}
    <span class="section-label">Additional lights</span>
    <section class="lights-grid">
      {#each extraLights as l (l.id)}
        <LightControl light={l} {live} />
      {/each}
    </section>
  {/if}

  <!-- ── Row 3: Grow plan ── -->
  <span class="section-label">Grow plan · center-canopy PPFD target by week</span>
  <section>
    <GrowPlanCard {growState} {livePpfd} {dimmerPct} {actualPhotoperiod} />
  </section>
</div>

<style>
  .lights-page {
    display: flex;
    flex-direction: column;
    gap: var(--gap);
  }
  .section-label {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--faint);
    padding: 2px 2px 0;
  }
  .grid12 {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: var(--gap);
    align-items: start;
  }
  .row-stretch {
    align-items: stretch;
  }
  .row-stretch :global(.panel) {
    height: 100%;
  }
  .c8 {
    grid-column: span 8;
  }
  .c4 {
    grid-column: span 4;
  }
  /* Saved readings sit beside the SPD chart and must match its height rather than driving the row
     taller (which left a dead gap under the chart). Taking the card out of flow means only the chart
     sizes the row; the card then stretches to it and scrolls its list internally. */
  .hist-fill {
    position: relative;
    min-height: 0;
  }
  .hist-fill > :global(.panel) {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .lights-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--gap);
    align-items: start;
  }

  /* Canopy PPFD stat card */
  .stat {
    display: flex;
    flex-direction: column;
  }
  .stat.primary {
    border-color: rgba(255, 176, 0, 0.35);
    background: linear-gradient(180deg, var(--amber-dim), rgba(255, 176, 0, 0) 62%);
  }
  .eyebrow {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  .stat .val {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    font-size: 2.7rem;
    line-height: 1;
    color: var(--amber);
  }
  .stat .val .unit {
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--muted);
    margin-left: 5px;
  }
  .stat .sub {
    margin-top: 10px;
    font-size: 0.72rem;
    color: var(--muted);
  }
  .flux-mini {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .flux-mini .kv {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }
  .flux-mini .k {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .flux-mini .v {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 0.78rem;
    color: var(--text);
  }
  .flux-mini .none {
    color: var(--faint);
  }
  .tgt-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: auto;
    padding-top: 12px;
  }
  .tgt-lab {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }
  .bar {
    position: relative;
    flex: 1;
    height: 6px;
    border-radius: var(--r-pill);
    background: var(--panel-2);
    overflow: hidden;
  }
  .bar > i {
    display: block;
    height: 100%;
    border-radius: var(--r-pill);
    background: var(--amber);
  }
  .delta.neg {
    color: var(--alert);
  }
  .delta.pos {
    color: var(--ok);
  }
  .badge {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 600;
    padding: 2px 7px;
    border: 1px solid var(--amber);
    border-radius: var(--r-pill);
    color: var(--amber);
    letter-spacing: 0.08em;
    white-space: nowrap;
  }
  .badge.ok {
    border-color: var(--ok);
    color: var(--ok);
  }
  .badge.muted {
    border-color: var(--line-strong);
    color: var(--muted);
  }

  /* Chart panel */
  .chart-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  .panel-title {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .mono-title {
    font-family: var(--font-mono);
    letter-spacing: 0.08em;
    text-transform: none;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .views {
    display: inline-flex;
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    overflow: hidden;
  }
  .vbtn {
    padding: 5px 11px;
    font-family: var(--font-mono);
    font-size: 0.66rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    background: var(--panel-2);
    border: none;
    border-left: 1px solid var(--line);
    cursor: pointer;
  }
  .vbtn:first-child {
    border-left: none;
  }
  .vbtn:hover {
    color: var(--text);
  }
  .vbtn.on {
    color: var(--amber);
    background: var(--amber-dim);
  }
  .vhint {
    margin: 0 0 8px;
    font-family: var(--font-mono);
    font-size: 0.66rem;
    letter-spacing: 0.04em;
    color: var(--faint);
    text-transform: uppercase;
  }
  .btn {
    padding: 6px 12px;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--muted);
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    cursor: pointer;
  }
  .btn:hover {
    color: var(--text);
  }
  .btn.primary {
    color: var(--amber);
    border-color: var(--amber);
    background: var(--amber-dim);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .empty {
    color: var(--faint);
    font-size: 0.9rem;
    padding: 24px 0;
    text-align: center;
  }
  .err {
    margin: 8px 0 0;
    color: var(--alert);
    font-size: 0.72rem;
  }
  .empty-control {
    display: grid;
    gap: 10px;
  }
  .muted {
    color: var(--muted);
    margin: 0;
    font-size: 0.85rem;
  }
  code {
    font-family: var(--font-mono);
    font-size: 0.85em;
    color: var(--text);
  }

  @media (max-width: 980px) {
    .row-stretch {
      align-items: start;
    }
    .c8,
    .c4 {
      grid-column: span 12;
    }
    /* Stacked single-column: let the card flow at its natural height again. */
    .hist-fill > :global(.panel) {
      position: static;
      max-height: 60vh;
    }
  }
</style>
