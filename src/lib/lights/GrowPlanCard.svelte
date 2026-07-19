<script lang="ts">
  import { dliFor, buildGuidance, STAGES, type GrowState, type StageKey } from '$lib/lights/grow-plan';

  let {
    growState,
    livePpfd,
    dimmerPct,
    actualPhotoperiod = null
  }: {
    growState: GrowState;
    livePpfd: number | null;
    dimmerPct: number | null;
    /** The light's actual on/off hours (from its schedule), for the plan-vs-light photoperiod check. */
    actualPhotoperiod?: { onHours: number; offHours: number } | null;
  } = $props();

  const guidance = $derived(buildGuidance(livePpfd, dimmerPct, growState.ppfdTarget));

  // Flag when the fixture's schedule doesn't match the stage's planned photoperiod (e.g. still on the
  // seedling 18/6 while the plan calls for veg 20/4).
  const photoperiodMismatch = $derived(
    actualPhotoperiod != null &&
      (actualPhotoperiod.onHours !== growState.onHours || actualPhotoperiod.offHours !== growState.offHours)
  );
  const dliNow = $derived(livePpfd == null ? null : dliFor(livePpfd, growState.onHours));
  const maxTarget = $derived(Math.max(...growState.weekly.map((w) => w.ppfdTarget)));

  const round = (n: number) => Math.round(n);
  const pct = (v: number) => `${(v / maxTarget) * 100}%`;
  const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(0)}%`;

  // Contiguous same-stage runs → phase strip segments (seedling · veg · flower · ripen).
  const phases = $derived.by(() => {
    const out: Array<{ stage: StageKey; count: number }> = [];
    for (const w of growState.weekly) {
      const last = out[out.length - 1];
      if (last && last.stage === w.stage) last.count += 1;
      else out.push({ stage: w.stage, count: 1 });
    }
    return out;
  });
  const phaseCols = $derived(phases.map((p) => `${p.count}fr`).join(' '));

  const actualPct = $derived(livePpfd == null ? null : `${(Math.min(livePpfd, maxTarget) / maxTarget) * 100}%`);
</script>

<div class="panel">
  <div class="panel-head">
    <span class="p-title">// Grow plan · {growState.stage.label} · wk {growState.week}</span>
    <div class="legend">
      <span class="lg"><span class="sw tgt"></span>Target</span>
      <span class="lg"><span class="sw act"></span>Actual</span>
    </div>
  </div>

  <div class="plan-stats">
    <div class="pstat">
      <span class="k">PPFD now / tgt</span>
      <span class="v">
        {livePpfd == null ? '—' : round(livePpfd)} <span class="t">/ {growState.ppfdTarget}</span>
        {#if guidance.deltaPct != null}<span class="d" class:neg={guidance.deltaPct < 0} class:pos={guidance.deltaPct >= 0}>{signed(guidance.deltaPct)}</span>{/if}
      </span>
      {#if growState.nextRamp}
        <span class="pstat-note">day {growState.dayOfGrow + 1} · → {growState.nextRamp.ppfd} on day {growState.nextRamp.onDay + 1}</span>
      {/if}
    </div>
    <div class="pstat">
      <span class="k">DLI now / tgt</span>
      <span class="v">{dliNow == null ? '—' : dliNow.toFixed(1)} <span class="t">/ {growState.dliTarget.toFixed(1)}</span></span>
    </div>
    <div class="pstat">
      <span class="k">Photoperiod</span>
      <span class="v">{growState.onHours} / {growState.offHours} <span class="t">plan</span></span>
      {#if photoperiodMismatch}
        <span class="pstat-note warn">⚠ light set to {actualPhotoperiod?.onHours} / {actualPhotoperiod?.offHours}</span>
      {/if}
    </div>
  </div>

  <p class="guide" class:ok={guidance.status === 'on-target'}>{guidance.message}</p>

  <div class="plan-scroll">
    <div class="plan" style="grid-template-columns: repeat({growState.weekly.length}, minmax(52px, 1fr));">
      {#each growState.weekly as w (w.week)}
        <div class="wk" class:cur={w.current}>
          <span class="tgt-val">{w.ppfdTarget}</span>
          <div class="col" style="height: {pct(w.ppfdTarget)};"></div>
          {#if w.current && actualPct != null}
            <span class="act" style="bottom: {actualPct};"></span>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  {#if livePpfd != null && guidance.deltaPct != null}
    <p class="plan-note mono">● wk {growState.week} actual ≈{round(livePpfd)} µmol · {signed(guidance.deltaPct)} vs {growState.ppfdTarget} target</p>
  {/if}

  <div class="plan-x" style="grid-template-columns: repeat({growState.weekly.length}, minmax(52px, 1fr));">
    {#each growState.weekly as w (w.week)}
      <div class="xl"><b>W{w.week}</b>{#if w.ppfdTarget === maxTarget}peak{/if}</div>
    {/each}
  </div>

  <div class="phase-strip" style="grid-template-columns: {phaseCols};">
    {#each phases as p}<span class="phase {p.stage}"></span>{/each}
  </div>
  <div class="phase-lab" style="grid-template-columns: {phaseCols};">
    {#each phases as p}<span>{STAGES[p.stage].label}</span>{/each}
  </div>
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
  .legend {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .lg {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 0.64rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .lg .sw {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  .lg .sw.tgt {
    background: var(--amber);
  }
  .lg .sw.act {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: var(--cyan);
  }

  .plan-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin: 4px 0 12px;
  }
  .pstat-note {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.02em;
    color: var(--muted);
  }
  .pstat-note.warn {
    color: var(--amber);
  }
  .pstat {
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    background: var(--panel-2);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .pstat .k {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .pstat .v {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 1rem;
    color: var(--text);
  }
  .pstat .v .t {
    color: var(--faint);
    font-size: 0.78rem;
  }
  .pstat .v .d {
    font-size: 0.72rem;
    margin-left: 4px;
  }
  .d.neg {
    color: var(--alert);
  }
  .d.pos {
    color: var(--ok);
  }

  .guide {
    margin: 0 0 4px;
    padding: 10px 12px;
    border: 1px dashed var(--line-strong);
    border-radius: var(--r-control);
    background: var(--panel-2);
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--muted);
  }
  .guide.ok {
    border-color: rgba(63, 185, 80, 0.35);
    color: var(--text);
  }

  .plan-scroll {
    overflow-x: auto;
    margin-top: 12px;
  }
  .plan {
    display: grid;
    gap: 10px;
    height: 176px;
    align-items: end;
    padding-top: 8px;
    border-bottom: 1px solid var(--line-strong);
  }
  .wk {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    height: 100%;
  }
  .wk .col {
    width: 60%;
    max-width: 30px;
    border-radius: 4px 4px 0 0;
    background: var(--amber-dim);
    border: 1px solid rgba(255, 176, 0, 0.28);
  }
  .wk.cur .col {
    background: var(--amber);
    border-color: var(--amber);
  }
  .wk .tgt-val {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: -2px;
    font-family: var(--font-mono);
    font-size: 0.6rem;
    color: var(--faint);
  }
  .wk.cur .tgt-val {
    color: var(--amber);
  }
  .wk .act {
    position: absolute;
    left: 50%;
    transform: translate(-50%, 50%);
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: var(--cyan);
    box-shadow: 0 0 0 2px var(--panel);
  }
  .plan-note {
    margin: 10px 0 0;
    font-size: 0.66rem;
    letter-spacing: 0.03em;
    color: var(--cyan);
  }
  .plan-x {
    display: grid;
    gap: 10px;
    margin-top: 6px;
  }
  .plan-x .xl {
    text-align: center;
    font-family: var(--font-mono);
    font-size: 0.6rem;
    color: var(--faint);
  }
  .plan-x .xl b {
    display: block;
    color: var(--muted);
    font-weight: 600;
  }
  .phase-strip {
    display: grid;
    gap: 3px;
    margin-top: 10px;
  }
  .phase {
    height: 4px;
    border-radius: 2px;
  }
  .phase.seedling {
    background: var(--cyan);
    opacity: 0.5;
  }
  .phase.veg {
    background: var(--ok);
    opacity: 0.65;
  }
  .phase.flower {
    background: var(--amber);
    opacity: 0.6;
  }
  .phase.ripen {
    background: var(--alert);
    opacity: 0.5;
  }
  .phase-lab {
    display: grid;
    gap: 3px;
    margin-top: 5px;
  }
  .phase-lab span {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--faint);
  }

  @media (max-width: 640px) {
    .plan-stats {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
