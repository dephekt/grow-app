<script lang="ts">
  import { untrack } from 'svelte';
  import { getLiveSnapshot } from '$lib/live-snapshot-context';
  import type { CaptureDetail, CaptureSummary } from '$lib/server/spectrum/captures';
  import SpdChart from '$lib/spectrum/SpdChart.svelte';
  import SpectrumTiles from '$lib/spectrum/SpectrumTiles.svelte';
  import SpectrumHistory from '$lib/spectrum/SpectrumHistory.svelte';

  let { data } = $props();
  const live = getLiveSnapshot();

  // The loader's retained frame is only a first-paint seed; once the SSE stream has
  // delivered anything (including a retained-clear → null) the live value is authoritative,
  // so a clear doesn't fall back to the now-stale seed.
  const liveSpectrum = $derived(live.spectrumReceived ? live.spectrum : data.initialSpectrum);

  let captures = $state<CaptureSummary[]>(untrack(() => data.captures));
  let selected = $state<CaptureDetail | null>(null);
  let saving = $state(false);
  let saveError = $state<string | null>(null);

  // Show the open historical reading if one is selected, else the live frame.
  const shown = $derived(
    selected
      ? { processed: selected.processed, integrationUs: selected.integrationUs ?? 0 }
      : liveSpectrum
        ? { processed: liveSpectrum.processed, integrationUs: liveSpectrum.integrationUs }
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
          {#if selected}
            <button class="btn" onclick={backToLive}>← Live</button>
          {:else}
            <button class="btn primary" onclick={save} disabled={saving || !liveSpectrum}>
              {saving ? 'Saving…' : 'Save reading'}
            </button>
          {/if}
        </div>
      </div>
      {#if shown}
        <SpdChart
          relative={shown.processed.relative}
          saturated={shown.processed.saturated}
          peaks={shown.processed.peaks}
        />
      {:else}
        <p class="empty">Waiting for the spectrometer to publish a frame…</p>
      {/if}
      {#if saveError}<p class="err mono">{saveError}</p>{/if}
    </div>
  </div>

  <div class="tiles-area">
    {#if shown}
      <SpectrumTiles processed={shown.processed} integrationUs={shown.integrationUs} />
    {/if}
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
  @media (max-width: 960px) {
    .chart-area,
    .tiles-area {
      grid-column: span 12;
    }
  }
</style>
