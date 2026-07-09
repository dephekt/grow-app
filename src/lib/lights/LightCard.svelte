<script lang="ts">
  import type { EntityConfig, LightConfig } from '$lib/server/mqtt/types';
  import type { LiveSnapshot } from '$lib/live-snapshot-context';
  import { computeSchedule, entityByRef, formatCountdown, toTimeInputValue } from '$lib/lights/model';

  let { light, live }: { light: LightConfig; live: LiveSnapshot } = $props();

  const snap = $derived(live.snapshot);

  // Resolve each role to its (cross-device) entity.
  const power = $derived(entityByRef(snap, light.roles.power));
  const arm = $derived(entityByRef(snap, light.roles.scheduleArm));
  const onTime = $derived(entityByRef(snap, light.roles.onTime));
  const offTime = $derived(entityByRef(snap, light.roles.offTime));
  const dimmer = $derived(entityByRef(snap, light.roles.dimmer));
  const metrics = $derived(
    (light.roles.metrics ?? []).map((ref) => entityByRef(snap, ref)).filter((e): e is EntityConfig => Boolean(e))
  );

  const isOn = $derived(Boolean(power && live.stateFor(power).value === power.payloadOn));
  const armed = $derived(Boolean(arm && live.stateFor(arm).value === arm.payloadOn));
  const hasSchedule = $derived(Boolean(arm || onTime || offTime));

  // Availability of the plug that owns on/off.
  const powerDevice = $derived.by(() => {
    if (!power) return undefined;
    return snap.devices.find((d) => d.id === power.device.identifiers[0] || d.nodeId === power.nodeId);
  });
  const offline = $derived(powerDevice?.availability === 'offline');

  // Live clock so the countdown ticks.
  let now = $state(new Date());
  $effect(() => {
    const timer = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(timer);
  });

  const sched = $derived(
    computeSchedule(onTime ? live.stateFor(onTime).value : null, offTime ? live.stateFor(offTime).value : null, now)
  );

  const statusText = $derived.by(() => {
    if (offline) return 'offline';
    if (!hasSchedule) return isOn ? 'on' : 'off';
    if (!armed) return 'manual';
    if (!sched.hasWindow || sched.secondsUntil === null) return 'no window';
    return `turns ${sched.next} in ${formatCountdown(sched.secondsUntil)}`;
  });

  function toggle(entity: EntityConfig | undefined, current: boolean) {
    if (entity) void live.sendCommand(entity, !current);
  }

  function sendTime(entity: EntityConfig | undefined, hhmm: string) {
    if (!entity || !hhmm) return;
    void live.sendCommand(entity, hhmm.length === 5 ? `${hhmm}:00` : hhmm);
  }

  // ── Dimmer slider: local value tracks the entity except while dragging ──
  let sliderValue = $state(100);
  let dragging = $state(false);
  let commitTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (!dimmer || dragging) return;
    const raw = live.stateFor(dimmer).value;
    if (raw !== null && raw !== '') sliderValue = Number(raw);
  });

  function commitDimmer(value: number) {
    if (dimmer) void live.sendCommand(dimmer, value);
  }
  function onDimmerInput(value: number) {
    sliderValue = value;
    dragging = true;
    if (commitTimer) clearTimeout(commitTimer);
    // Debounce the publish; self-heal `dragging` if no change event follows.
    commitTimer = setTimeout(() => {
      commitTimer = null;
      dragging = false;
      commitDimmer(value);
    }, 200);
  }
  function onDimmerChange(value: number) {
    if (commitTimer) {
      clearTimeout(commitTimer);
      commitTimer = null;
    }
    sliderValue = value;
    dragging = false;
    commitDimmer(value);
  }
</script>

<div class="panel light-card">
  <div class="panel-head">
    <div class="title-wrap">
      <span class="dot {offline ? 'alert' : isOn ? 'ok' : ''}"></span>
      <span class="panel-title">{light.name}</span>
      {#if light.type}<span class="type mono">{light.type}</span>{/if}
    </div>
    <span class="status mono" class:on={isOn && !offline}>{isOn ? 'ON' : 'OFF'} · {statusText}</span>
  </div>

  {#if power}
    <div class="row">
      <span class="row-label">Power</span>
      <button
        type="button"
        class="toggle"
        class:on={isOn}
        disabled={offline || live.commandPending[power.id]}
        onclick={() => toggle(power, isOn)}
      >
        {isOn ? 'On' : 'Off'}
      </button>
    </div>
  {/if}

  {#if dimmer}
    <div class="row">
      <span class="row-label">Brightness</span>
      <div class="slider-wrap">
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={sliderValue}
          disabled={live.commandPending[dimmer.id]}
          oninput={(e) => onDimmerInput(Number(e.currentTarget.value))}
          onchange={(e) => onDimmerChange(Number(e.currentTarget.value))}
        />
        <span class="slider-val mono">{Math.round(sliderValue)}%</span>
      </div>
    </div>
  {/if}

  {#if hasSchedule}
    <div class="section">
      <div class="section-head">
        <span class="row-label">Schedule</span>
        {#if arm}
          <button
            type="button"
            class="toggle sm"
            class:on={armed}
            disabled={live.commandPending[arm.id]}
            onclick={() => toggle(arm, armed)}
          >
            {armed ? 'Armed' : 'Manual'}
          </button>
        {/if}
      </div>
      <div class="times">
        {#if onTime}
          <label class="time-field">
            <span>On</span>
            <input
              type="time"
              value={toTimeInputValue(live.stateFor(onTime).value)}
              disabled={live.commandPending[onTime.id]}
              onchange={(e) => sendTime(onTime, e.currentTarget.value)}
            />
          </label>
        {/if}
        {#if offTime}
          <label class="time-field">
            <span>Off</span>
            <input
              type="time"
              value={toTimeInputValue(live.stateFor(offTime).value)}
              disabled={live.commandPending[offTime.id]}
              onchange={(e) => sendTime(offTime, e.currentTarget.value)}
            />
          </label>
        {/if}
      </div>
    </div>
  {/if}

  {#if metrics.length > 0}
    <div class="metrics">
      {#each metrics as m (m.id)}
        <div class="metric">
          <span class="metric-label">{m.name}</span>
          <span class="metric-value mono">{live.formatState(m)}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if !power && !dimmer && metrics.length === 0}
    <p class="empty">No controls discovered for this light yet.</p>
  {/if}
</div>

<style>
  .light-card {
    display: grid;
    gap: 14px;
    align-content: start;
  }

  .title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .type {
    font-size: 0.66rem;
    color: var(--faint);
  }

  .status {
    font-size: 0.72rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .status.on {
    color: var(--ok);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .row-label,
  .metric-label {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .toggle {
    min-width: 72px;
    min-height: var(--tap);
    padding: 0 14px;
    border: 1px solid var(--faint);
    border-radius: var(--r-control);
    background: var(--panel-2);
    color: var(--muted);
    cursor: pointer;
    font-weight: 700;
  }
  .toggle.on {
    border-color: var(--amber);
    background: var(--amber-dim);
    color: var(--amber);
  }
  .toggle.sm {
    min-width: 64px;
    min-height: 30px;
    padding: 0 12px;
    font-size: 0.75rem;
  }
  .toggle:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .slider-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    max-width: 62%;
  }
  .slider-wrap input[type='range'] {
    flex: 1;
    min-width: 0;
    accent-color: var(--amber);
  }
  .slider-val {
    min-width: 42px;
    text-align: right;
    color: var(--text);
    font-size: 0.82rem;
  }

  .section {
    display: grid;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .times {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
  }
  .time-field {
    display: grid;
    gap: 4px;
  }
  .time-field span {
    font-size: 0.66rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .time-field input {
    min-height: var(--tap);
    padding: 0 8px;
    box-sizing: border-box;
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    background: var(--panel-2);
    color: var(--text);
    font-family: var(--font-mono);
  }
  .time-field input:disabled {
    opacity: 0.55;
    cursor: wait;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 8px 16px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .metric-value {
    font-size: 0.9rem;
    color: var(--text);
  }

  .empty {
    margin: 0;
    color: var(--faint);
    font-size: 0.85rem;
  }
</style>
