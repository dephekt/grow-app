<script lang="ts">
  import MixCalculator from '$lib/mixing/MixCalculator.svelte';
  import { mix, TANK, DOSE_TABLE, FEED_SCHEDULE, MIX_ORDER, MEDIUM, feedTargetForStage } from '$lib/mixing/athena';
  import { resolveGrowState } from '$lib/lights/grow-plan';
  import { selectHydroReadings } from '$lib/mixing/hydro';
  import { getLiveSnapshot } from '$lib/live-snapshot-context';

  const live = getLiveSnapshot();
  const hydro = $derived(selectHydroReadings(live.snapshot));

  // Where the grow is right now → default the calculator + quick reference to this stage's feed target.
  const feedTarget = feedTargetForStage(resolveGrowState(new Date()).stage.key);

  const fmt1 = (n: number) => {
    const s = (Math.round(n * 10) / 10).toFixed(1);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
  };

  // Quick reference at the current stage's feed EC — what to pour for the batch you're mixing now.
  const initial = mix(feedTarget.ec, TANK.full);
  const refill = mix(feedTarget.ec, TANK.refill);
  const scheduleEcs = new Set(FEED_SCHEDULE.map((s) => s.ec));
</script>

<svelte:head><title>Mixing · Grow</title></svelte:head>

<div class="mix">
  <MixCalculator {hydro} {feedTarget} />

  <!-- Quick reference @ EC 3.0 -->
  <div class="panel">
    <div class="panel-head"><span class="panel-title">Quick reference · {feedTarget.stageLabel} · EC {feedTarget.ec.toFixed(1)}</span><span class="mono sub">for the batch you're mixing now</span></div>
    <div class="quick">
      <div class="qcard">
        <span class="q-when">Initial fill · {TANK.full} L</span>
        <div class="q-rows">
          <span>Grow / Bloom</span><span class="mono v">{fmt1(initial.growBloom)} mL</span>
          <span>Core</span><span class="mono v">{fmt1(initial.core)} mL</span>
        </div>
      </div>
      <div class="qcard">
        <span class="q-when">Refill · {TANK.refill} L</span>
        <div class="q-rows">
          <span>Grow / Bloom</span><span class="mono v">{fmt1(refill.growBloom)} mL</span>
          <span>Core</span><span class="mono v">{fmt1(refill.core)} mL</span>
        </div>
      </div>
    </div>
    <p class="tank-facts mono">
      Tank: {TANK.full} L full by float · ~{TANK.refill} L usable to the valve · a normal refill adds {TANK.refill} L back to full.
    </p>
  </div>

  <div class="two">
    <!-- Feed schedule -->
    <div class="panel">
      <div class="panel-head"><span class="panel-title">Your schedule · CCI LED coco</span><span class="mono sub">feed EC = what you mix</span></div>
      <div class="tbl-scroll">
        <table>
          <thead>
            <tr><th>Stage</th><th>Feed EC</th><th>Grow / Bloom</th><th>Core</th><th>Cleanse</th><th>pH</th><th>Subst. EC</th></tr>
          </thead>
          <tbody>
            {#each FEED_SCHEDULE as s (s.key)}
              <tr>
                <td><b>{s.label}</b><span class="wk mono">{s.weeks}</span></td>
                <td class="mono">{s.ec.toFixed(1)}</td>
                <td class="mono">{s.primary.name.replace('Pro ', '')} {s.primary.ml}</td>
                <td class="mono">{s.core}</td>
                <td class="mono">{s.cleanse}</td>
                <td class="mono ph">{s.ph}</td>
                <td class="mono">{s.substrateEc}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <ul class="notes">
        <li><b>Medium:</b> {MEDIUM.label} — {MEDIUM.detail} · coco EC {MEDIUM.bufferedEc} → batch pH {MEDIUM.ph.label} (CCI coco).</li>
        <li><b>Feed EC vs substrate EC:</b> feed/drip EC is what you mix (this table + calculator). Substrate EC is the in-pot pour-through you steer toward via dryback — higher; never mix to it.</li>
        {#each FEED_SCHEDULE.filter((s) => s.note) as s (s.key)}
          <li><b>{s.label}:</b> {s.note}</li>
        {/each}
        <li>Targets: CCI Black Book LED coco setpoints (p.57 / p.64); doses = Athena Pro 226 g/L. Grow in veg, Bloom in flower.</li>
      </ul>
    </div>

    <!-- Procedure -->
    <div class="panel">
      <div class="panel-head"><span class="panel-title">Mixing procedure</span><span class="mono sub">order matters</span></div>
      <ol class="steps">
        {#each MIX_ORDER as step (step.order)}
          <li>
            <span class="s-num mono">{step.order}</span>
            <span class="s-body"><b>{step.name}</b>{step.detail}</span>
          </li>
        {/each}
      </ol>
      <p class="warn mono">⚠ Combining concentrates undiluted precipitates — add each to the reservoir separately.</p>
    </div>
  </div>

  <!-- Dosage chart -->
  <div class="panel">
    <div class="panel-head"><span class="panel-title">Dosage chart · 226 g/L concentrate</span><span class="mono sub">mL per 10 L</span></div>
    <div class="tbl-scroll">
      <table>
        <thead>
          <tr><th>Target EC</th><th>Pro Grow / Pro Bloom</th><th>Pro Core</th></tr>
        </thead>
        <tbody>
          {#each DOSE_TABLE as row (row.ec)}
            <tr class:hi={scheduleEcs.has(row.ec)}>
              <td class="mono">{row.ec.toFixed(1)}</td>
              <td class="mono">{row.growBloom} mL</td>
              <td class="mono">{row.core} mL</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="chart-note mono">Highlighted rows are your schedule's feed-EC targets (1.5 seedling · 3.5 veg/early-flower · 3.0 bulk · 2.5 finish). The calculator interpolates in between.</p>
  </div>
</div>

<style>
  .mix {
    display: flex;
    flex-direction: column;
    gap: var(--gap);
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--gap);
  }
  .sub {
    font-size: 0.66rem;
    color: var(--faint);
    letter-spacing: 0.04em;
  }

  /* Quick reference */
  .quick {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .qcard {
    padding: 12px 14px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--r-control);
  }
  .q-when {
    display: block;
    font-family: var(--font-mono);
    font-size: 0.64rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--amber);
    margin-bottom: 8px;
  }
  .q-rows {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .q-rows .v {
    color: var(--text);
    text-align: right;
  }
  .tank-facts {
    margin: 12px 0 0;
    font-size: 0.64rem;
    color: var(--faint);
    line-height: 1.5;
  }

  /* Tables */
  .tbl-scroll {
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
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    padding: 6px 10px;
    border-bottom: 1px solid var(--line-strong);
    white-space: nowrap;
  }
  td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--line);
    color: var(--text);
    vertical-align: top;
  }
  td .wk {
    display: block;
    font-size: 0.6rem;
    color: var(--faint);
  }
  td.ph {
    font-size: 0.68rem;
    color: var(--muted);
    white-space: normal;
  }
  tr.hi td {
    background: var(--amber-dim);
  }

  .notes {
    margin: 12px 0 0;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 0.68rem;
    line-height: 1.45;
    color: var(--muted);
  }
  .notes b {
    color: var(--text);
  }

  /* Procedure steps */
  .steps {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .steps li {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .s-num {
    flex: none;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border: 1px solid var(--amber);
    border-radius: var(--r-pill);
    color: var(--amber);
    font-size: 0.72rem;
  }
  .s-body {
    font-size: 0.74rem;
    line-height: 1.5;
    color: var(--muted);
  }
  .s-body b {
    display: block;
    color: var(--text);
    font-weight: 600;
    margin-bottom: 1px;
  }
  .warn {
    margin: 0;
    font-size: 0.66rem;
    color: var(--amber);
    line-height: 1.5;
  }
  .chart-note {
    margin: 10px 0 0;
    font-size: 0.62rem;
    color: var(--faint);
    line-height: 1.5;
  }

  @media (max-width: 720px) {
    .two,
    .quick {
      grid-template-columns: 1fr;
    }
  }
</style>
