<script lang="ts">
  import { untrack } from 'svelte';
  import Sparkline from '$lib/Sparkline.svelte';
  import type { PresentedSection } from '$lib/device-presentation';
  import type { EntityConfig } from '$lib/server/mqtt/types';
  import type { LiveSnapshot } from '$lib/live-snapshot-context';

  let {
    groups,
    live,
    deviceEntities
  } = $props<{
    groups: PresentedSection[];
    live: LiveSnapshot;
    deviceEntities: EntityConfig[];
  }>();

  // ── Probe & step detection ──────────────────────────────────────────────────

  type ProbeType = 'ph' | 'ec' | 'rtd' | 'orp';

  interface CalStep {
    key: string;        // e.g. "mid", "low", "high", "dry", "k"
    label: string;      // e.g. "Mid Point"
    solution: string;   // e.g. "pH 7.00 buffer solution"
    instruction: string;
    target: number | null;
    isDry: boolean;
    entity: EntityConfig | null;
  }

  interface ProbeConfig {
    type: ProbeType;
    label: string;
    steps: CalStep[];
    liveEntity: EntityConfig | null;
    clearEntity: EntityConfig | null;
  }

  const PH_STEPS: Array<{ key: string; label: string; solution: string; instruction: string; target: number; isDry: boolean; patterns: string[] }> = [
    {
      key: 'mid',
      label: 'Mid Point',
      solution: 'pH 7.00 buffer solution',
      instruction: 'Rinse the probe with DI water, then submerge in pH 7.00 buffer solution. Wait for reading to stabilize.',
      target: 7.00,
      isDry: false,
      patterns: ['ph_cal_mid', 'cal_mid', 'ph_mid']
    },
    {
      key: 'low',
      label: 'Low Point',
      solution: 'pH 4.00 buffer solution',
      instruction: 'Rinse the probe with DI water, then submerge in pH 4.00 buffer solution. Wait for reading to stabilize.',
      target: 4.00,
      isDry: false,
      patterns: ['ph_cal_low', 'cal_low', 'ph_low']
    },
    {
      key: 'high',
      label: 'High Point',
      solution: 'pH 10.00 buffer solution',
      instruction: 'Rinse the probe with DI water, then submerge in pH 10.00 buffer solution. Wait for reading to stabilize.',
      target: 10.00,
      isDry: false,
      patterns: ['ph_cal_high', 'cal_high', 'ph_high']
    }
  ];

  const EC_STEPS: Array<{ key: string; label: string; solution: string; instruction: string; target: number | null; isDry: boolean; patterns: string[] }> = [
    {
      key: 'dry',
      label: 'Dry Calibration',
      solution: 'Air (probe must be dry)',
      instruction: 'Ensure the probe is completely dry before calibrating. Remove from solution and let air dry.',
      target: null,
      isDry: true,
      patterns: ['ec_cal_dry', 'cal_dry']
    },
    {
      key: 'low',
      label: 'Low Point',
      solution: '12,880 µS/cm EC standard',
      instruction: 'Submerge the probe in a 12,880 µS/cm EC calibration standard. Wait for reading to stabilize.',
      target: 12880,
      isDry: false,
      patterns: ['ec_cal_low', 'cal_low']
    },
    {
      key: 'high',
      label: 'High Point',
      solution: '80,000 µS/cm EC standard',
      instruction: 'Submerge the probe in an 80,000 µS/cm EC calibration standard. Wait for reading to stabilize.',
      target: 80000,
      isDry: false,
      patterns: ['ec_cal_high', 'cal_high']
    }
  ];

  const RTD_STEPS: Array<{ key: string; label: string; solution: string; instruction: string; target: number; isDry: boolean; patterns: string[] }> = [
    {
      key: 'point',
      label: 'Reference Temp',
      solution: 'Known-temperature reference bath',
      instruction: 'Place the probe in a liquid whose temperature is accurately known. Wait for reading to stabilize, then calibrate.',
      target: 100,
      isDry: false,
      patterns: ['rtd_cal', 'rtd_point']
    }
  ];

  const ORP_STEPS: Array<{ key: string; label: string; solution: string; instruction: string; target: number; isDry: boolean; patterns: string[] }> = [
    {
      key: 'point',
      label: 'Single Point',
      solution: 'ORP standard solution (225 mV)',
      instruction: 'Submerge the probe in ORP standard solution. Wait for reading to stabilize.',
      target: 225,
      isDry: false,
      patterns: ['orp_cal', 'orp_point']
    }
  ];

  function matchesPatterns(objectId: string, patterns: string[]): boolean {
    const normalized = objectId.toLowerCase().replace(/_{2,}/g, '_');
    return patterns.some((p) => normalized.includes(p));
  }

  function detectProbeType(objectId: string): ProbeType | null {
    const n = objectId.toLowerCase();
    if (n.includes('ph_cal') || n.includes('ph_mid') || n.includes('ph_low') || n.includes('ph_high')) return 'ph';
    if (n.includes('ec_cal') || n.includes('ec_dry') || n.includes('ec_low') || n.includes('ec_high')) return 'ec';
    if (n.includes('rtd_cal') || n.includes('rtd_point')) return 'rtd';
    if (n.includes('orp_cal') || n.includes('orp_point')) return 'orp';
    // Fallback: if it just has _cal_ and is in a ph/ec/rtd/orp-named group
    return null;
  }

  const PROBE_READING: Record<
    ProbeType,
    { objectId: string; deviceClass?: string; units: string[]; hint: string }
  > = {
    ph: { objectId: 'water_ph', deviceClass: 'ph', units: ['ph'], hint: 'ph' },
    ec: { objectId: 'water_ec', deviceClass: 'conductivity', units: ['µs/cm', 'ms/cm', 'us/cm'], hint: 'ec' },
    rtd: { objectId: 'water_temperature', deviceClass: 'temperature', units: ['°c'], hint: 'temp' },
    orp: { objectId: 'water_orp', deviceClass: 'voltage', units: ['mv'], hint: 'orp' }
  };

  // Reject the probe's *sub*-readings — raw electrode voltage, slope/asymmetry
  // quality, temperature compensation, and queue/firmware/status diagnostics — so
  // the live reading is the actual pH / EC / temp / ORP value, not e.g. a slope %.
  function isProbeReading(e: EntityConfig): boolean {
    const oid = (e.objectId ?? '').toLowerCase();
    return !/(voltage|slope|asymmetry|queue|firmware|version|status|command|compensation|calibrat|reset|k_value|k_type)/.test(
      oid
    );
  }

  function findLiveSensor(type: ProbeType, entities: EntityConfig[]): EntityConfig | null {
    const want = PROBE_READING[type];
    const sensors = entities.filter((e) => e.component === 'sensor' && isProbeReading(e));
    // 1) the probe's canonical primary reading
    const exact = sensors.find((s) => (s.objectId ?? '').toLowerCase() === want.objectId);
    if (exact) return exact;
    // 2) fall back to deviceClass / unit, but only among sensors whose id still names
    //    the probe (`hint`) — so a renamed reading can't latch onto an unrelated mV/°C
    //    sensor (e.g. ORP binding to some other millivolt reading).
    return (
      sensors.find((s) => {
        if (!(s.objectId ?? '').toLowerCase().includes(want.hint)) return false;
        return (
          (want.deviceClass !== undefined && (s.deviceClass ?? '').toLowerCase() === want.deviceClass) ||
          want.units.includes((s.unit ?? '').toLowerCase())
        );
      }) ?? null
    );
  }

  function buildProbes(groups: PresentedSection[], deviceEntities: EntityConfig[]): ProbeConfig[] {
    const allEntries = groups.flatMap((g) => g.entries);
    const calEntities = allEntries
      .map((e) => e.entity)
      .filter((e) => {
        const oid = (e.objectId ?? e.id).toLowerCase();
        return oid.includes('_cal') || oid.includes('cal_');
      });

    if (calEntities.length === 0) return [];

    // Group by probe type
    const probeEntitiesMap = new Map<ProbeType, EntityConfig[]>();
    for (const e of calEntities) {
      const oid = (e.objectId ?? e.id).toLowerCase();
      // Check group context too (e.g. group id 'ph_cal')
      const entryMeta = allEntries.find((en) => en.entity.id === e.id);
      const groupId = (entryMeta?.groupId ?? '').toLowerCase();
      const combinedKey = `${oid}_${groupId}`;

      let type = detectProbeType(combinedKey) ?? detectProbeType(oid);
      if (!type) {
        // Guess from group
        if (groupId.includes('ph')) type = 'ph';
        else if (groupId.includes('ec')) type = 'ec';
        else if (groupId.includes('rtd')) type = 'rtd';
        else if (groupId.includes('orp')) type = 'orp';
        else type = 'ph'; // default fallback
      }

      const list = probeEntitiesMap.get(type) ?? [];
      list.push(e);
      probeEntitiesMap.set(type, list);
    }

    const probeOrder: ProbeType[] = ['ph', 'ec', 'rtd', 'orp'];
    const probeLabels: Record<ProbeType, string> = { ph: 'pH', ec: 'EC', rtd: 'RTD', orp: 'ORP' };

    const stepsForType: Record<ProbeType, typeof PH_STEPS> = {
      ph: PH_STEPS,
      ec: EC_STEPS as typeof PH_STEPS,
      rtd: RTD_STEPS as typeof PH_STEPS,
      orp: ORP_STEPS as typeof PH_STEPS
    };

    const probes: ProbeConfig[] = [];

    for (const type of probeOrder) {
      const entities = probeEntitiesMap.get(type);
      if (!entities || entities.length === 0) continue;

      const stepDefs = stepsForType[type];
      const steps: CalStep[] = [];
      for (const def of stepDefs) {
        const entity = entities.find((e) => matchesPatterns((e.objectId ?? e.id).toLowerCase(), def.patterns)) ?? null;
        if (!entity) continue;
        steps.push({
          key: def.key,
          label: def.label,
          solution: def.solution,
          instruction: def.instruction,
          target: def.target ?? null,
          isDry: def.isDry,
          entity
        });
      }

      if (steps.length === 0) continue;

      const liveEntity = findLiveSensor(type, deviceEntities);
      const clearEntity = deviceEntities.find((e) => {
        const oid = (e.objectId ?? e.id).toLowerCase();
        return e.component === 'button' && (oid.includes(`${type}_cal_clear`) || oid.includes('cal_clear'));
      }) ?? null;

      probes.push({
        type,
        label: probeLabels[type],
        steps,
        liveEntity,
        clearEntity
      });
    }

    return probes;
  }

  let probes = $derived(buildProbes(groups, deviceEntities));

  // ── Selected probe & step state ─────────────────────────────────────────────
  let selectedProbeType = $state<ProbeType | null>(null);
  let doneMap = $state<Record<string, boolean>>({}); // entity.id → done

  let activeProbe = $derived(
    (selectedProbeType ? probes.find((p) => p.type === selectedProbeType) : null) ?? probes[0] ?? null
  );

  let activeStepIndex = $derived.by(() => {
    if (!activeProbe) return 0;
    // First incomplete step, else last step
    const first = activeProbe.steps.findIndex((s) => s.entity && !doneMap[s.entity.id]);
    return first >= 0 ? first : activeProbe.steps.length - 1;
  });

  let activeStep = $derived(activeProbe?.steps[activeStepIndex] ?? null);

  // ── Live reading + stability ─────────────────────────────────────────────────
  interface Reading {
    value: number;
    time: number;
  }

  let readingBuffer = $state<Reading[]>([]);
  let sampleKey = ''; // plain (non-reactive) — current probe:step, used to reset the buffer

  const BUFFER_SIZE = 14;
  const STABLE_WINDOW_MS = 2600;

  // Sample the active probe's live sensor into a rolling buffer. This effect tracks
  // ONLY the probe/step and the live value; all readingBuffer reads/writes are
  // untracked so the effect never depends on its own write (which would self-loop
  // and throw effect_update_depth_exceeded once the value starts updating).
  $effect(() => {
    const probe = activeProbe;
    const stepKey = activeStep?.key;
    const liveEntity = probe?.liveEntity ?? null;
    const stateVal = liveEntity ? live.snapshot.states[liveEntity.id]?.value : null;

    untrack(() => {
      const key = `${probe?.type ?? ''}:${stepKey ?? ''}`;
      if (key !== sampleKey) {
        sampleKey = key;
        readingBuffer = [];
      }
      if (!liveEntity || stateVal == null) return;
      const n = parseFloat(stateVal);
      if (isNaN(n)) return;
      readingBuffer = [...readingBuffer.slice(-(BUFFER_SIZE - 1)), { value: n, time: Date.now() }];
    });
  });

  let tolerance = $derived.by(() => {
    if (!activeStep) return 0.06;
    if (activeStep.isDry) {
      const maxTarget = Math.max(0, ...(activeProbe?.steps.map((s) => (s.target != null ? Math.abs(s.target) : 0)) ?? [0]));
      return Math.max(0.06, maxTarget * 0.005);
    }
    if (activeStep.target == null) return 0.06;
    return Math.max(0.02, Math.abs(activeStep.target) * 0.008);
  });

  let isStable = $derived.by(() => {
    if (readingBuffer.length < 3) return false;
    const now = Date.now();
    const recent = readingBuffer.filter((r) => now - r.time <= STABLE_WINDOW_MS);
    if (recent.length < 2) return false;
    const values = recent.map((r) => r.value);
    const spread = Math.max(...values) - Math.min(...values);
    return spread <= tolerance;
  });

  let sparklinePoints = $derived(readingBuffer.map((r) => r.value));

  let liveDisplayValue = $derived.by(() => {
    if (!activeProbe?.liveEntity) return null;
    const v = live.snapshot.states[activeProbe.liveEntity.id]?.value;
    if (v == null) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  });

  let liveDisplayStr = $derived(
    liveDisplayValue != null
      ? liveDisplayValue.toFixed(activeProbe?.type === 'ph' ? 2 : 1)
      : '—'
  );

  let liveUnit = $derived(activeProbe?.liveEntity?.unit ?? '');

  // ── Commands ─────────────────────────────────────────────────────────────────
  async function calibrateStep(step: CalStep) {
    if (!step.entity || !isStable) return;
    try {
      // Gate on the published result, not the absence of an error — a cancelled
      // dangerous-confirm records no error but also publishes nothing.
      const ok = await live.sendCommand(step.entity);
      if (ok) {
        doneMap = { ...doneMap, [step.entity.id]: true };
      }
    } catch {
      // error already recorded in live.commandErrors by sendCommand
    }
  }

  function clearCalibration() {
    doneMap = {};
    readingBuffer = [];
    if (activeProbe?.clearEntity) {
      live.sendCommand(activeProbe.clearEntity);
    }
  }

  function armStep(step: CalStep) {
    if (!step.entity) return;
    doneMap = { ...doneMap, [step.entity.id]: false };
    readingBuffer = [];
  }

  let allDone = $derived(
    Boolean(activeProbe && activeProbe.steps.every((s) => s.entity && doneMap[s.entity.id]))
  );
</script>

{#if probes.length === 0}
  <p class="muted no-cal">No calibration entities found for this device.</p>
{:else}
  <div class="cal-shell">
    <!-- ── Probe tabs ── -->
    {#if probes.length > 1}
      <div class="probe-tabs">
        {#each probes as probe (probe.type)}
          <button
            type="button"
            class="probe-tab"
            class:active={probe.type === (activeProbe?.type ?? probes[0]?.type)}
            onclick={() => { selectedProbeType = probe.type; doneMap = {}; readingBuffer = []; }}
          >
            {probe.label}
          </button>
        {/each}
      </div>
    {/if}

    {#if activeProbe}
      <div class="cal-layout">
        <!-- ── Left: current step + live reading ── -->
        <div class="cal-main">
          <!-- Step indicator -->
          <div class="step-indicator">
            {#if allDone}
              <span class="step-label done">ALL POINTS CALIBRATED</span>
            {:else}
              <span class="step-label">STEP {activeStepIndex + 1} / {activeProbe.steps.length}</span>
            {/if}
          </div>

          {#if activeStep}
            <div class="step-card panel">
              <div class="step-head">
                <h3 class="step-name">{activeStep.label}</h3>
                {#if activeStep.solution}
                  <span class="step-solution muted">{activeStep.solution}</span>
                {/if}
              </div>
              <p class="step-instruction">{activeStep.instruction}</p>

              <!-- Live Reading box -->
              <div class="live-box" class:no-sensor={!activeProbe.liveEntity}>
                <div class="live-header">
                  <span class="panel-title">Live Reading</span>
                  {#if activeProbe.liveEntity}
                    <div class="stability-indicator">
                      <span class="dot" class:ok={isStable} class:warn={!isStable && readingBuffer.length > 0}></span>
                      <span class="stability-text">
                        {#if isStable}
                          STABLE · READY
                        {:else if readingBuffer.length < 2}
                          WAITING FOR DATA…
                        {:else}
                          STABILIZING…
                        {/if}
                      </span>
                    </div>
                  {/if}
                </div>

                <div class="live-value-row">
                  <span class="live-reading mono">{liveDisplayStr}</span>
                  {#if liveUnit && liveDisplayStr !== '—'}
                    <span class="live-unit muted">{liveUnit}</span>
                  {/if}
                </div>

                {#if activeProbe.liveEntity && sparklinePoints.length > 1}
                  <div class="sparkline-wrap">
                    <Sparkline points={sparklinePoints} color={isStable ? 'var(--ok)' : 'var(--amber)'} height={36} />
                  </div>
                {:else if !activeProbe.liveEntity}
                  <p class="no-sensor-note muted">No live sensor found for this probe. Calibrate will remain disabled.</p>
                {/if}
              </div>

              <!-- Calibrate button -->
              {#if activeStep.entity}
                {@const calPending = live.commandPending[activeStep.entity.id]}
                <button
                  type="button"
                  class="calibrate-btn"
                  class:ready={isStable}
                  disabled={!isStable || calPending || !activeProbe.liveEntity}
                  onclick={() => activeStep && calibrateStep(activeStep)}
                >
                  {calPending ? 'Calibrating…' : `Calibrate · ${activeStep.label}`}
                </button>
                {#if live.commandErrors[activeStep.entity.id]}
                  <p class="cmd-error">{live.commandErrors[activeStep.entity.id]}</p>
                {/if}
              {/if}
            </div>
          {/if}
        </div>

        <!-- ── Right: step list + actions ── -->
        <div class="cal-sidebar">
          <div class="panel sidebar-panel">
            <p class="panel-title">Steps in order</p>
            <div class="step-list">
              {#each activeProbe.steps as step, i (step.key)}
                {@const isDone = Boolean(step.entity && doneMap[step.entity.id])}
                {@const isActive = i === activeStepIndex && !allDone}
                <button
                  type="button"
                  class="step-row"
                  class:active={isActive}
                  class:done={isDone}
                  onclick={() => {
                    if (isDone) {
                      armStep(step);
                    }
                  }}
                  title={isDone ? 'Click to re-calibrate' : ''}
                >
                  <span class="dot" class:ok={isDone} class:warn={isActive && !isDone}></span>
                  <span class="step-row-label">{step.label}</span>
                  <span class="step-row-status muted mono">
                    {isDone ? 'DONE' : isActive ? 'ACTIVE' : 'PENDING'}
                  </span>
                </button>
              {/each}
            </div>

            <div class="sidebar-actions">
              <button type="button" class="clear-btn" onclick={clearCalibration}>
                CLEAR
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .no-cal {
    margin: 0;
    padding: 24px 0;
    font-size: 0.88rem;
    text-align: center;
    color: var(--muted);
  }

  .cal-shell {
    display: grid;
    gap: var(--gap);
  }

  .probe-tabs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .probe-tab {
    padding: 6px 14px;
    border: 1px solid var(--line-strong);
    border-radius: var(--r-control);
    background: var(--panel-2);
    color: var(--muted);
    cursor: pointer;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    transition: color 0.1s, border-color 0.1s, background 0.1s;
  }

  .probe-tab.active {
    border-color: var(--amber);
    background: var(--amber-dim);
    color: var(--amber);
  }

  .cal-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 220px;
    gap: var(--gap);
    align-items: start;
  }

  .cal-main {
    display: grid;
    gap: var(--gap);
  }

  .step-indicator {
    padding: 2px 0;
  }

  .step-label {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    font-family: var(--font-mono);
  }

  .step-label.done {
    color: var(--ok);
  }

  .step-card {
    display: grid;
    gap: 14px;
  }

  .step-head {
    display: grid;
    gap: 4px;
  }

  .step-name {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text);
  }

  .step-solution {
    font-size: 0.82rem;
    color: var(--muted);
  }

  .step-instruction {
    margin: 0;
    font-size: 0.88rem;
    color: var(--muted);
    line-height: 1.5;
  }

  .live-box {
    border: 1px solid var(--line);
    border-radius: var(--r-panel);
    padding: 14px 16px;
    background: var(--panel-2);
    display: grid;
    gap: 10px;
  }

  .live-box.no-sensor {
    border-color: var(--line);
    opacity: 0.7;
  }

  .live-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .panel-title {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 0;
  }

  .stability-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stability-text {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-family: var(--font-mono);
    color: var(--muted);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: var(--r-pill);
    background: var(--faint);
    flex: none;
  }
  .dot.ok { background: var(--ok); }
  .dot.warn { background: var(--amber); }

  .live-value-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .live-reading {
    font-size: 2.6rem;
    line-height: 1;
    color: var(--text);
  }

  .live-unit {
    font-size: 1.1rem;
    color: var(--muted);
    font-family: var(--font-mono);
  }

  .muted {
    color: var(--muted);
  }

  .sparkline-wrap {
    margin-top: 4px;
  }

  .no-sensor-note {
    margin: 0;
    font-size: 0.82rem;
    color: var(--muted);
  }

  .calibrate-btn {
    display: block;
    width: 100%;
    min-height: 42px;
    border: 1px solid var(--faint);
    border-radius: var(--r-control);
    background: var(--panel-2);
    color: var(--faint);
    cursor: not-allowed;
    font: inherit;
    font-size: 0.88rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }

  .calibrate-btn.ready {
    border-color: var(--amber);
    background: var(--amber-dim);
    color: var(--amber);
    cursor: pointer;
  }

  .calibrate-btn.ready:hover {
    background: rgba(255, 176, 0, 0.22);
  }

  .calibrate-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .cmd-error {
    margin: 0;
    font-size: 0.82rem;
    color: var(--alert);
  }

  /* ── Sidebar ── */
  .cal-sidebar {
    position: sticky;
    top: var(--gap);
  }

  .sidebar-panel {
    display: grid;
    gap: 12px;
  }

  .step-list {
    display: grid;
    gap: 4px;
  }

  .step-row {
    display: grid;
    grid-template-columns: 8px 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: var(--r-small);
    background: transparent;
    color: var(--muted);
    cursor: default;
    font: inherit;
    font-size: 0.82rem;
    text-align: left;
    transition: background 0.1s, border-color 0.1s;
  }

  .step-row.active {
    background: var(--amber-dim);
    border-color: rgba(255, 176, 0, 0.2);
    color: var(--text);
  }

  .step-row.done {
    cursor: pointer;
    color: var(--muted);
  }

  .step-row.done:hover {
    background: var(--panel-2);
    border-color: var(--line-strong);
  }

  .step-row-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .step-row-status {
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    flex: none;
  }

  .sidebar-actions {
    margin-top: 4px;
  }

  .clear-btn {
    width: 100%;
    min-height: var(--tap);
    border: 1px solid var(--line-strong);
    border-radius: var(--r-control);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    transition: border-color 0.1s, color 0.1s;
  }

  .clear-btn:hover {
    border-color: var(--alert);
    color: var(--alert);
  }

  @media (max-width: 700px) {
    .cal-layout {
      grid-template-columns: 1fr;
    }

    .cal-sidebar {
      position: static;
    }
  }
</style>
