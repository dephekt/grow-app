<script lang="ts">
  import { mix, volumeForMode, TANK, EC_MIN, EC_MAX, type MixMode } from '$lib/mixing/athena';

  let mode = $state<MixMode>('full');
  let customL = $state(1);
  let ec = $state(3.0);

  const EC_CHIPS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];

  const volumeL = $derived(mode === 'custom' ? Math.max(0, customL || 0) : volumeForMode(mode, 0));
  const result = $derived(mix(ec, volumeL));

  // 1 decimal, trailing .0 trimmed — accurate for a full tank (427.5) and a 1 L pitcher (2.7) alike.
  const fmt1 = (n: number) => {
    const s = (Math.round(n * 10) / 10).toFixed(1);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
  };
  const fmtVol = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
</script>

<div class="panel calc">
  <div class="panel-head">
    <span class="p-title">// Reservoir mix · Athena Pro Line</span>
    <span class="basis mono">{fmtVol(volumeL)} L · EC {ec.toFixed(1)}</span>
  </div>

  <!-- Water volume -->
  <div class="field">
    <span class="lbl">Water volume</span>
    <div class="seg" role="group" aria-label="Water volume">
      <button type="button" class:on={mode === 'full'} onclick={() => (mode = 'full')}>
        <b>Full tank</b><span class="mono">{TANK.full} L</span>
      </button>
      <button type="button" class:on={mode === 'refill'} onclick={() => (mode = 'refill')}>
        <b>Refill</b><span class="mono">{TANK.refill} L</span>
      </button>
      <button type="button" class:on={mode === 'custom'} onclick={() => (mode = 'custom')}>
        <b>Custom</b><span class="mono">L</span>
      </button>
    </div>
    {#if mode === 'custom'}
      <label class="custom">
        <span class="mono">Litres</span>
        <input type="number" min="0" step="0.1" bind:value={customL} aria-label="Custom litres" />
      </label>
    {/if}
    <span class="hint">Full = fresh fill from empty · Refill = a normal top-up (drain-to-valve back to full).</span>
  </div>

  <!-- Target EC -->
  <div class="field">
    <span class="lbl">Target EC <span class="mono">mS/cm</span></span>
    <div class="ec-row">
      <input class="ec-input mono" type="number" min="0" step="0.1" bind:value={ec} aria-label="Target EC" />
      <div class="chips" role="group" aria-label="EC presets">
        {#each EC_CHIPS as v (v)}
          <button type="button" class="chip mono" class:on={ec === v} onclick={() => (ec = v)}>{v.toFixed(1)}</button>
        {/each}
      </div>
    </div>
    <span class="hint">Your schedule: EC 3.0 veg & flower. Seedlings gentler — try 1.0–1.5.</span>
    {#if result.extrapolated}
      <span class="hint warn">⚠ EC is outside the printed chart ({EC_MIN}–{EC_MAX}); this dose is extrapolated.</span>
    {/if}
  </div>

  <!-- Result -->
  <div class="doses">
    <div class="dose">
      <span class="d-name">Pro Grow / Pro Bloom</span>
      <span class="d-val mono" data-testid="dose-grow-bloom">{fmt1(result.growBloom)}<i>mL</i></span>
      <span class="d-basis mono">{fmt1(result.perTenL.growBloom)} mL/10 L × {fmtVol(volumeL)} L</span>
      <span class="d-note">Grow in veg · Bloom in flower — same dose</span>
    </div>
    <div class="dose">
      <span class="d-name">Pro Core</span>
      <span class="d-val mono" data-testid="dose-core">{fmt1(result.core)}<i>mL</i></span>
      <span class="d-basis mono">{fmt1(result.perTenL.core)} mL/10 L × {fmtVol(volumeL)} L</span>
      <span class="d-note">Add separately — never combine concentrates</span>
    </div>
  </div>

  <p class="order-note">
    Balance first (dose to pH) → the concentrate for the stage → Core → Cleanse. Add each separately, then check EC + pH.
  </p>
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
  .basis {
    font-size: 0.72rem;
    color: var(--cyan);
    letter-spacing: 0.04em;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }
  .lbl {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .lbl .mono {
    color: var(--faint);
    text-transform: none;
    letter-spacing: 0;
  }
  .hint {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.02em;
    color: var(--faint);
  }
  .hint.warn {
    color: var(--amber);
  }

  /* Segmented volume control */
  .seg {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .seg button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-height: var(--tap);
    padding: 8px 12px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    color: var(--muted);
    cursor: pointer;
  }
  .seg button b {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text);
  }
  .seg button span {
    font-size: 0.66rem;
    color: var(--faint);
  }
  .seg button:hover {
    border-color: var(--line-strong);
  }
  .seg button.on {
    border-color: var(--amber);
    background: var(--amber-dim);
  }
  .seg button.on b,
  .seg button.on span {
    color: var(--amber);
  }

  .custom {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
  }
  .custom .mono {
    font-size: 0.66rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  input[type='number'] {
    background: var(--bg);
    border: 1px solid var(--line-strong);
    border-radius: var(--r-control);
    color: var(--text);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 0.9rem;
    padding: 7px 10px;
    width: 92px;
    min-height: var(--tap);
  }
  input[type='number']:focus-visible {
    outline: 2px solid var(--amber);
    outline-offset: 1px;
  }

  /* EC input + chips */
  .ec-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .ec-input {
    width: 96px;
    font-size: 1rem;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chip {
    min-width: 46px;
    min-height: var(--tap);
    padding: 6px 10px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--muted);
    font-size: 0.74rem;
    cursor: pointer;
  }
  .chip:hover {
    border-color: var(--line-strong);
    color: var(--text);
  }
  .chip.on {
    border-color: var(--amber);
    background: var(--amber-dim);
    color: var(--amber);
  }

  /* Dose output */
  .doses {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin: 6px 0 12px;
  }
  .dose {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 16px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--r-control);
  }
  .d-name {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .d-val {
    font-size: 1.9rem;
    font-weight: 600;
    line-height: 1.1;
    color: var(--amber);
  }
  .d-val i {
    font-style: normal;
    font-size: 0.9rem;
    font-weight: 400;
    color: var(--faint);
    margin-left: 4px;
  }
  .d-basis {
    font-size: 0.64rem;
    color: var(--faint);
  }
  .d-note {
    font-size: 0.64rem;
    color: var(--muted);
  }

  .order-note {
    margin: 0;
    padding: 10px 12px;
    border: 1px dashed var(--line-strong);
    border-radius: var(--r-control);
    background: var(--panel-2);
    font-size: 0.72rem;
    line-height: 1.5;
    color: var(--muted);
  }

  @media (max-width: 560px) {
    .doses {
      grid-template-columns: 1fr;
    }
    .seg {
      grid-template-columns: 1fr;
    }
  }
</style>
