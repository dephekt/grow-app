<script lang="ts">
  import { untrack } from 'svelte';
  import { getLiveSnapshot } from '$lib/live-snapshot-context';
  import type { CaptureDetail, CaptureSummary } from '$lib/server/spectrum/captures';
  import { processSpectrum, type SpectrumView, type SpectroConfig } from '$lib/spectrum/calibration';
  import SpdChart from '$lib/spectrum/SpdChart.svelte';
  import SpectrumTiles from '$lib/spectrum/SpectrumTiles.svelte';
  import SpectrumHistory from '$lib/spectrum/SpectrumHistory.svelte';

  type Anchors = SpectroConfig['anchors'];

  let { data } = $props();
  const live = getLiveSnapshot();

  // Active PPFD calibration anchors (lux estimate and/or Apogee reference). Seeded from the loader,
  // then updated in place after a Calibrate action so the tile lights up without a reload.
  let anchors = $state<Anchors>(untrack(() => data.anchors));

  // The fleet's live illuminance (DLight/BH1750), found by device_class — what a lux calibration
  // will use. Display-only; the anchor is actually computed from the authoritative frame server-side.
  const liveLux = $derived.by(() => {
    const snap = live.snapshot;
    const ent = snap?.entities?.find((e) => e.deviceClass === 'illuminance' || e.unit === 'lx');
    if (!ent) return null;
    const raw = snap.states[ent.id]?.value;
    const lux = Number(raw);
    return raw != null && Number.isFinite(lux) ? lux : null;
  });

  let calibrating = $state(false);
  let calibrateError = $state<string | null>(null);
  let luxOverride = $state(''); // optional handheld-meter lux; blank ⇒ use the live DLight reading

  async function calibrateFromLux() {
    calibrating = true;
    calibrateError = null;
    try {
      const override = Number(luxOverride);
      const body: { source: 'lux'; lux?: number } = { source: 'lux' };
      if (luxOverride.trim() && Number.isFinite(override) && override > 0) body.lux = override;
      const res = await fetch('/api/spectrum/anchor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => null)) as { message?: string } | null;
        calibrateError = msg?.message ?? `Calibrate failed (${res.status})`;
        return;
      }
      anchors = ((await res.json()) as { anchors: Anchors }).anchors;
      await refetchList(); // history PPFD now reflects the new anchor
    } catch {
      calibrateError = 'Calibrate failed';
    } finally {
      calibrating = false;
    }
  }

  // The loader's retained frame is only a first-paint seed; once the SSE stream has
  // delivered anything (including a retained-clear → null) the live value is authoritative,
  // so a clear doesn't fall back to the now-stale seed.
  const liveSpectrum = $derived(live.spectrumReceived ? live.spectrum : data.initialSpectrum);

  let captures = $state<CaptureSummary[]>(untrack(() => data.captures));
  let selected = $state<CaptureDetail | null>(null);
  let saving = $state(false);
  let saveError = $state<string | null>(null);

  // 'Photon' is the grower's lens (what plants count); Energy matches maker SPD charts; Raw is the
  // sensor's untransformed view. The client re-derives the chosen view from the frame's raw counts.
  const VIEWS: SpectrumView[] = ['photon', 'energy', 'raw'];
  const VIEW_HINT: Record<SpectrumView, string> = {
    photon: 'µmol — photon flux',
    energy: 'W/nm — radiant power',
    raw: 'sensor counts, uncorrected'
  };
  let view = $state<SpectrumView>('photon');

  // Open historical reading if selected, else the live frame — carry the RAW counts so the view
  // toggle can reprocess client-side (calibration is a pure module) with no round-trip.
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
  // Reprocess client-side for the chosen view, preserving the firmware's authoritative saturation
  // flag (processSpectrum still ORs in the pixel-scan check) so the chart's SATURATED overlay — and,
  // once anchored, the PPFD null-gate — match what the sensor reported, not just a full-scale scan.
  const active = $derived(
    source
      ? processSpectrum(source.counts, {
          view,
          adcFullScale: (1 << source.adcBits) - 1,
          integrationUs: source.integrationUs,
          saturated: source.saturated,
          config: { anchors }
        })
      : null
  );

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

<svelte:head><title>grow-app · spectrum</title></svelte:head>

<div class="spectrum">
  <div class="chart-area">
    <div class="panel chart-panel">
      <div class="chart-head">
        <span class="panel-title">// SPECTRAL POWER DISTRIBUTION{selected ? ' · SAVED READING' : ' · LIVE'}</span>
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

  <div class="tiles-area">
    {#if active && source}
      <SpectrumTiles processed={active} integrationUs={source.integrationUs} />
    {/if}

    <div class="panel calib">
      <span class="panel-title">// CALIBRATE PPFD</span>
      <p class="calib-line">
        DLight <span class="mono">{liveLux == null ? '—' : `${liveLux.toFixed(0)} lx`}</span>
        {#if anchors.lux}
          · lux anchor @ <span class="mono">{anchors.lux.luxValue?.toFixed(0)} lx</span>
        {/if}
        {#if anchors.reference}
          · <span class="ref-tag mono">REF SET</span>
        {/if}
      </p>
      <div class="calib-row">
        <input
          class="lux-in mono"
          type="number"
          inputmode="numeric"
          placeholder="lux override"
          bind:value={luxOverride}
        />
        <button
          class="btn primary"
          onclick={calibrateFromLux}
          disabled={calibrating || !liveSpectrum || selected != null || liveSpectrum?.saturated}
        >
          {calibrating ? 'Calibrating…' : 'Calibrate from lux'}
        </button>
      </div>
      <p class="calib-hint">
        Co-locate the DLight at the sensor aperture, then anchor. Blank = use the live DLight reading.
        Estimate ≈±15% until an Apogee reference is set.
      </p>
      {#if calibrateError}<p class="err mono">{calibrateError}</p>{/if}
    </div>
  </div>

  <div class="history-area">
    <SpectrumHistory {captures} selectedId={selected?.id ?? null} onSelect={openCapture} />
  </div>
</div>

<style>
  .spectrum {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: var(--gap);
    align-items: start;
  }
  .chart-area {
    grid-column: span 8;
  }
  .tiles-area {
    grid-column: span 4;
  }
  .history-area {
    grid-column: span 12;
  }
  .chart-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .panel-title {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--muted);
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
    color: var(--red, #d33);
    font-size: 0.72rem;
  }
  .calib {
    margin-top: var(--gap);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .calib-line {
    margin: 4px 0 0;
    font-size: 0.72rem;
    color: var(--muted);
  }
  .ref-tag {
    color: var(--amber);
    font-size: 0.62rem;
  }
  .calib-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .lux-in {
    flex: 1;
    min-width: 0;
    padding: 6px 10px;
    font-size: 0.78rem;
    color: var(--text);
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--r-control);
  }
  .calib-hint {
    margin: 0;
    font-size: 0.64rem;
    line-height: 1.35;
    color: var(--faint);
  }
  @media (max-width: 960px) {
    .chart-area,
    .tiles-area {
      grid-column: span 12;
    }
  }
</style>
