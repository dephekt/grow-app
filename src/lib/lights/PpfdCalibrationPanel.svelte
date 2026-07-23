<script lang="ts">
  import { onMount } from 'svelte';
  import type { LiveSnapshot } from '$lib/live-snapshot-context';
  import { processSpectrum, type SpectroConfig } from '$lib/spectrum/calibration';
  import { liveQuantumPpfd } from '$lib/entity-match';

  type Anchors = SpectroConfig['anchors'];

  let { live }: { live: LiveSnapshot } = $props();

  let anchors = $state<Anchors>({});
  let busy = $state<string | null>(null); // which action is in flight
  let err = $state<string | null>(null);
  let luxOverride = $state('');
  let refUmol = $state('');

  onMount(async () => {
    try {
      const res = await fetch('/api/spectrum/anchor');
      if (res.ok) anchors = ((await res.json()) as { anchors: Anchors }).anchors;
    } catch {
      /* offline — leave empty */
    }
  });

  // Fleet illuminance (DLight/BH1750), found by device_class — what a lux calibration will use.
  const liveLux = $derived.by(() => {
    const snap = live.snapshot;
    const ent = snap?.entities?.find((e) => e.deviceClass === 'illuminance' || e.unit === 'lx');
    if (!ent) return null;
    const raw = snap.states[ent.id]?.value;
    const lux = Number(raw);
    return raw != null && Number.isFinite(lux) ? lux : null;
  });

  // The Apogee SQ-521 quantum sensor's live PPFD — the reference a one-click anchor captures.
  // Null when the publisher is offline (so its retained value can't be anchored as if live).
  const liveApogeePpfd = $derived(liveQuantumPpfd(live.snapshot));

  const liveSpectrum = $derived(live.spectrumReceived ? live.spectrum : null);
  const processed = $derived(
    liveSpectrum
      ? processSpectrum(liveSpectrum.counts, {
          adcFullScale: (1 << liveSpectrum.adcBits) - 1,
          integrationUs: liveSpectrum.integrationUs,
          saturated: liveSpectrum.saturated,
          liveLux: liveLux ?? undefined,
          config: { anchors }
        })
      : null
  );
  const canAnchor = $derived(Boolean(liveSpectrum) && !liveSpectrum?.saturated);

  // Derived lux/µmol factor from the stored lux anchor (what "lux ≈ PPFD × factor" uses).
  const luxFactor = $derived.by(() => {
    const a = anchors.lux;
    if (!a || !a.luxValue || !(a.referenceUmol > 0)) return null;
    return a.luxValue / a.referenceUmol;
  });

  const fmtTime = (iso: string | undefined) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—');

  async function post(body: Record<string, unknown>, tag: string) {
    busy = tag;
    err = null;
    try {
      const res = await fetch('/api/spectrum/anchor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => null)) as { message?: string } | null;
        err = msg?.message ?? `Failed (${res.status})`;
        return;
      }
      anchors = ((await res.json()) as { anchors: Anchors }).anchors;
    } catch {
      err = 'Request failed';
    } finally {
      busy = null;
    }
  }

  function calibrateFromLux() {
    const v = Number(luxOverride);
    const body: { source: 'lux'; lux?: number } = { source: 'lux' };
    if (luxOverride.trim() && Number.isFinite(v) && v > 0) body.lux = v;
    void post(body, 'lux');
  }

  function setReference() {
    const v = Number(refUmol);
    if (!(v > 0)) {
      err = 'Enter the quantum-meter reading in µmol';
      return;
    }
    void post({ source: 'reference', referenceUmol: v }, 'reference');
  }

  function anchorFromApogee() {
    // No referenceUmol — the server reads the live Apogee value authoritatively (never trust the client).
    void post({ source: 'reference' }, 'apogee');
  }

  async function clearAnchor(source: 'lux' | 'reference') {
    busy = `clear:${source}`;
    err = null;
    try {
      const res = await fetch(`/api/spectrum/anchor?source=${source}`, { method: 'DELETE' });
      if (res.ok) anchors = ((await res.json()) as { anchors: Anchors }).anchors;
    } catch {
      err = 'Request failed';
    } finally {
      busy = null;
    }
  }
</script>

<div class="panel cal">
  <div class="panel-head">
    <span class="p-title">// PPFD calibration</span>
    {#if anchors.reference}
      <span class="badge ok">REF</span>
    {:else if anchors.lux}
      <span class="badge">EST · LUX</span>
    {:else}
      <span class="badge muted">UNCALIBRATED</span>
    {/if}
  </div>

  <p class="lead">
    Anchor the spectrometer's absolute PPFD scale to a co-incident meter reading. Anchor straight from
    the live Apogee SQ-521 (±5%) when it's online, or type a reading; a lux anchor (from the DLight,
    ≈±15%) is the stand-in until then. Place the meter at the canopy sensor aperture, then anchor
    against the live frame.
  </p>

  <div class="rows">
    <div class="kv"><span class="k">Live DLight</span><span class="v">{liveLux == null ? '—' : `${liveLux.toFixed(0)} lx`}</span></div>
    <div class="kv"><span class="k">Live PPFD</span><span class="v">{processed?.ppfd == null ? '—' : `${processed.ppfdSource === 'reference' ? '' : '≈'}${processed.ppfd.toFixed(0)} µmol`}</span></div>
    <div class="kv"><span class="k">Live Apogee</span><span class="v">{liveApogeePpfd == null ? '—' : `${liveApogeePpfd.toFixed(0)} µmol`}</span></div>
    <div class="kv"><span class="k">Derived factor</span><span class="v">{luxFactor == null ? '—' : `${luxFactor.toFixed(1)} lux / µmol`}</span></div>
    <div class="kv">
      <span class="k">Lux anchor</span>
      <span class="v">
        {#if anchors.lux}{anchors.lux.luxValue?.toFixed(0)} lx · {fmtTime(anchors.lux.capturedAt)}{:else}<span class="none">not set</span>{/if}
      </span>
    </div>
    <div class="kv">
      <span class="k">Apogee reference</span>
      <span class="v">
        {#if anchors.reference}{anchors.reference.referenceUmol.toFixed(0)} µmol · {fmtTime(anchors.reference.capturedAt)}{:else}<span class="none">not set</span>{/if}
      </span>
    </div>
  </div>

  <div class="control">
    <label class="ctl-label" for="lux-override">Calibrate from lux</label>
    <div class="ctl-row">
      <input id="lux-override" class="in mono" type="number" inputmode="numeric" placeholder="lux override (blank = live DLight)" bind:value={luxOverride} />
      <button class="btn primary" onclick={calibrateFromLux} disabled={!canAnchor || busy != null}>
        {busy === 'lux' ? 'Calibrating…' : 'Calibrate from lux'}
      </button>
      {#if anchors.lux}
        <button class="btn ghost" onclick={() => clearAnchor('lux')} disabled={busy != null}>Clear</button>
      {/if}
    </div>
  </div>

  <div class="control">
    <label class="ctl-label" for="ref-umol">Apogee reference</label>
    <div class="ctl-row">
      <button class="btn primary" onclick={anchorFromApogee} disabled={!canAnchor || liveApogeePpfd == null || liveApogeePpfd <= 0 || busy != null}>
        {busy === 'apogee' ? 'Anchoring…' : `Anchor from live Apogee${liveApogeePpfd != null ? ` · ${liveApogeePpfd.toFixed(0)} µmol` : ''}`}
      </button>
      {#if anchors.reference}
        <button class="btn ghost" onclick={() => clearAnchor('reference')} disabled={busy != null}>Clear</button>
      {/if}
    </div>
    <div class="ctl-row">
      <input id="ref-umol" class="in mono" type="number" inputmode="numeric" placeholder="or type µmol·m⁻²·s⁻¹ manually" bind:value={refUmol} />
      <button class="btn" onclick={setReference} disabled={!canAnchor || busy != null}>
        {busy === 'reference' ? 'Setting…' : 'Set manually'}
      </button>
    </div>
  </div>

  {#if !canAnchor}
    <p class="hint warn">
      {liveSpectrum?.saturated ? 'Live frame is saturated — dim the light or shorten exposure, then retry.' : 'Waiting for a live spectrometer frame…'}
    </p>
  {/if}
  {#if err}<p class="hint err mono">{err}</p>{/if}
</div>

<style>
  .p-title {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
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
  }
  .badge.ok {
    border-color: var(--ok);
    color: var(--ok);
  }
  .badge.muted {
    border-color: var(--line-strong);
    color: var(--muted);
  }
  .lead {
    margin: 0 0 14px;
    font-size: 0.78rem;
    line-height: 1.5;
    color: var(--muted);
    max-width: 62ch;
  }
  .rows {
    display: flex;
    flex-direction: column;
    margin-bottom: 14px;
  }
  .kv {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 0;
    border-top: 1px solid var(--line);
  }
  .kv:first-child {
    border-top: none;
  }
  .kv .k {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .kv .v {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem;
    color: var(--text);
    text-align: right;
  }
  .kv .v .none {
    color: var(--faint);
  }
  .control {
    display: grid;
    gap: 6px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .ctl-label {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .ctl-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .in {
    flex: 1;
    min-width: 180px;
    padding: 8px 10px;
    font-size: 0.8rem;
    color: var(--text);
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--r-control);
  }
  .in::placeholder {
    color: var(--faint);
  }
  .btn {
    padding: 8px 12px;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--muted);
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    cursor: pointer;
    white-space: nowrap;
  }
  .btn:hover {
    color: var(--text);
  }
  .btn.primary {
    color: var(--amber);
    border-color: var(--amber);
    background: var(--amber-dim);
  }
  .btn.ghost {
    color: var(--muted);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .hint {
    margin: 10px 0 0;
    font-size: 0.72rem;
    color: var(--faint);
  }
  .hint.warn {
    color: var(--amber);
  }
  .hint.err {
    color: var(--alert);
  }
</style>
