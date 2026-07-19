<script lang="ts">
  import type { EntityConfig, LightConfig } from '$lib/server/mqtt/types';
  import type { LiveSnapshot } from '$lib/live-snapshot-context';
  import { computeSchedule, entityByRef, formatCountdown, photoperiodHours } from '$lib/lights/model';
  import { toTimeInputValue } from '$lib/time-entity';

  let {
    light,
    live,
    stageLabel
  }: { light: LightConfig; live: LiveSnapshot; stageLabel?: string } = $props();

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
    return snap.devices.find((d) => d.id === power.device.identifiers[0]);
  });
  const offline = $derived(powerDevice?.availability === 'offline');

  // Live clock so the countdown ticks. Only runs when there's a schedule to count down.
  let now = $state(new Date());
  $effect(() => {
    if (!hasSchedule) return;
    const timer = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(timer);
  });

  const sched = $derived(
    computeSchedule(
      onTime ? live.stateFor(onTime).value : null,
      offTime ? live.stateFor(offTime).value : null,
      now,
      snap.timezone
    )
  );

  // Photoperiod (owned here, since this control holds the schedule): on/off wall-clock and the
  // on/off hour split derived from the window itself, so "20 / 4" is live off the schedule.
  const onClock = $derived(onTime ? toTimeInputValue(live.stateFor(onTime).value) : null);
  const offClock = $derived(offTime ? toTimeInputValue(live.stateFor(offTime).value) : null);
  const photoperiod = $derived(
    photoperiodHours(onTime ? live.stateFor(onTime).value : null, offTime ? live.stateFor(offTime).value : null)
  );

  const countdown = $derived(
    hasSchedule && armed && sched.hasWindow && sched.secondsUntil !== null
      ? `${sched.next === 'off' ? 'off' : 'on'} in ${formatCountdown(sched.secondsUntil)}`
      : null
  );

  const headStatus = $derived(offline ? 'OFFLINE' : isOn ? 'ON' : 'OFF');

  function toggle(entity: EntityConfig | undefined, current: boolean) {
    if (entity) void live.sendCommand(entity, !current);
  }

  function sendTime(entity: EntityConfig | undefined, hhmm: string) {
    if (!entity || !hhmm) return;
    void live.sendCommand(entity, hhmm.length === 5 ? `${hhmm}:00` : hhmm);
  }

  let drawerOpen = $state(false);

  // ── Dimmer slider ──
  // `sliderValue` is what the input shows. `lastSent` is the last brightness we published, kept to
  // de-dupe a redundant repeat of the same command. While `settling` is true we ignore inbound
  // echoes so the slider doesn't snap back to the pre-command value before the device applies ours.
  // Settling ends when the device echoes our value, when the publish fails, or when a grace timeout
  // elapses — the last two guarantee the slider can never freeze out of sync with the device.
  const SETTLE_TIMEOUT_MS = 3000;
  let sliderValue = $state(100);
  let lastSent = $state<number | null>(null);
  let settling = $state(false);
  let commitTimer: ReturnType<typeof setTimeout> | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => () => {
    if (commitTimer) clearTimeout(commitTimer);
    if (settleTimer) clearTimeout(settleTimer);
  });

  function stopSettling() {
    settling = false;
    if (settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
  }

  $effect(() => {
    if (!dimmer) return;
    const value = live.stateFor(dimmer).value;
    if (value === null || value === '') return;
    const echoed = Number(value);
    if (settling) {
      if (echoed === lastSent) stopSettling();
      return;
    }
    sliderValue = echoed;
  });

  function send(value: number) {
    if (value === lastSent) return;
    lastSent = value;
    settling = true;
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      settling = false;
      lastSent = null;
    }, SETTLE_TIMEOUT_MS);
    if (dimmer) {
      void live.sendCommand(dimmer, value).then((ok) => {
        if (!ok) {
          stopSettling();
          lastSent = null;
        }
      });
    }
  }
  function onDimmerInput(value: number) {
    lastSent = null;
    sliderValue = value;
    if (commitTimer) clearTimeout(commitTimer);
    commitTimer = setTimeout(() => {
      commitTimer = null;
      send(value);
    }, 200);
  }
  function onDimmerChange(value: number) {
    if (commitTimer) {
      clearTimeout(commitTimer);
      commitTimer = null;
    }
    sliderValue = value;
    send(value);
  }
</script>

<div class="panel lc">
  <div class="panel-head">
    <div class="title-wrap">
      <span class="dot {offline ? 'alert' : isOn ? 'ok' : ''}"></span>
      <span class="panel-title">{light.name}</span>
      {#if light.type}<span class="type mono">{light.type}</span>{/if}
    </div>
    <span class="status mono" class:on={isOn && !offline}>{headStatus}</span>
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
        <!-- Not gated on `offline`: the dimmer lives on a different node (the DAC),
             so the plug being offline doesn't apply to it. -->
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
    <div class="pp-card">
      <span class="pp-title">Photoperiod</span>
      <div class="pp-big">
        {isOn ? 'ON' : 'OFF'}
        {#if photoperiod}<span class="sm">· {photoperiod.onHours} / {photoperiod.offHours}{#if stageLabel} {stageLabel.toLowerCase()}{/if}</span>{/if}
      </div>
      <div class="pp-sub">
        {#if countdown}{countdown} · {/if}{#if onClock && offClock}on <span class="mono">{onClock}</span> / off <span class="mono">{offClock}</span>{:else if !armed}manual{/if}
      </div>
    </div>

    <div class="drawer">
      <button type="button" class="drawer-toggle" aria-expanded={drawerOpen} onclick={() => (drawerOpen = !drawerOpen)}>
        <span class="chev" class:open={drawerOpen}>▸</span> Schedule &amp; fixture details
      </button>
      {#if drawerOpen}
        <div class="drawer-body">
          {#if arm || onTime || offTime}
            <div class="section">
              <div class="section-head">
                <span class="row-label">Schedule</span>
                {#if arm}
                  <button
                    type="button"
                    class="toggle sm"
                    class:on={armed}
                    disabled={offline || live.commandPending[arm.id]}
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
                      disabled={offline || live.commandPending[onTime.id]}
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
                      disabled={offline || live.commandPending[offTime.id]}
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
        </div>
      {/if}
    </div>
  {/if}

  {#if !power && !dimmer && metrics.length === 0 && !hasSchedule}
    <p class="empty">No controls discovered for this light yet.</p>
  {/if}
</div>

<style>
  .lc {
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

  /* Photoperiod card — always-visible summary the control owns. */
  .pp-card {
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    background: var(--panel-2);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pp-title {
    font-family: var(--font-mono);
    font-size: 0.66rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .pp-big {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--ok);
    line-height: 1;
  }
  .pp-big .sm {
    font-size: 0.8rem;
    color: var(--muted);
    font-weight: 400;
    margin-left: 6px;
  }
  .pp-sub {
    font-size: 0.72rem;
    color: var(--muted);
  }
  .pp-sub .mono {
    color: var(--text);
  }

  /* Drawer */
  .drawer {
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }
  .drawer-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 0;
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .drawer-toggle:hover {
    color: var(--text);
  }
  .chev {
    color: var(--faint);
    transition: transform 0.12s ease;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .drawer-body {
    display: grid;
    gap: 14px;
    margin-top: 10px;
  }
  .section {
    display: grid;
    gap: 8px;
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
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px 16px;
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
