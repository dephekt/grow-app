<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Daniel Snider -->

<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { PageProps } from './$types';
  import BandGauge from '$lib/climate/BandGauge.svelte';
  import ClimateLog from '$lib/climate/ClimateLog.svelte';
  import {
    AIR_VPD_HARD_MAX,
    CLIMATE_MODES,
    type ActuatorSource,
    type ClimateMode
  } from '$lib/climate/model';
  import { absoluteHumidityGPerM3 } from '$lib/climate/psychro';
  import { LOG_PAGE_SIZE, type ClimateEventJson, type ClimateLiveState } from './+page';

  let { data }: PageProps = $props();

  let climate = $state<ClimateLiveState>(untrack(() => data.state));
  let events = $state<ClimateEventJson[]>(untrack(() => data.events));
  let eventTotal = $state(untrack(() => data.eventTotal));
  let eventAnchorId = $state(untrack(() => data.eventAnchorId));
  let error = $state('');
  let saving = $state(false);

  // Same source the irrigation page uses. The API gate is unchanged — this is about not
  // offering a control that hands a mains relay to an automation and will then be refused.
  const isAdmin = $derived(data.user?.isAdmin);
  const config = $derived(climate.config);
  const action = $derived(climate.action);
  const exhaustArmed = $derived(config.exhaustSource === 'loop');
  const rhArmed = $derived(config.rhSource === 'loop');
  const armedArms = $derived(climate.arms.filter((a) => a.on).map((a) => a.objectId));

  // The loop ticks every 30 s; refreshing at 10 s keeps the verdict from looking stale without
  // making the page a load source of its own.
  onMount(() => {
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  });

  /** Bumped by every save. A poll that straddles one is discarded rather than ordered against
   *  it: ordering by issue time let a later-issued poll win with pre-save data. */
  let saveGeneration = 0;

  async function refresh(): Promise<void> {
    if (saving) return;
    const gen = saveGeneration;
    try {
      const res = await fetch('/api/climate');
      if (!res.ok) return;
      const next = (await res.json()) as ClimateLiveState;
      if (gen !== saveGeneration || saving) return;
      climate = next;
      // Page 1 only: the verdict updating while the ACTIONS panel sat frozen read as a loop
      // that was not recording, on the page whose job is to prove it does.
      if (logOffset === 0) await loadEvents(0, true);
    } catch {
      // A dropped poll is not worth surfacing; the next one recovers.
    }
  }

  async function patch(body: Record<string, unknown>): Promise<void> {
    const gen = ++saveGeneration;
    saving = true;
    error = '';
    try {
      const res = await fetch('/api/climate', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = (await res.json()) as ClimateLiveState & { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        error = json.error ?? 'Could not save';
        return;
      }
      // A newer save supersedes this one.
      if (gen === saveGeneration) climate = json;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not save';
    } finally {
      saving = false;
    }
  }

  function setSource(key: 'exhaustSource' | 'rhSource', armed: boolean): void {
    const released: ActuatorSource = key === 'exhaustSource' ? 'firmware' : 'external';
    void patch({ [key]: armed ? 'loop' : released });
  }

  /** Commit a number only when it parses and actually changed, so a half-typed field is inert. */
  function commitNumber(key: string, raw: string, current: number | null): 'restore' | void {
    const trimmed = raw.trim();
    if (trimmed === '') {
      // Blank means "follow the plan" for the override, and a discarded edit everywhere else.
      if (key === 'airVpdOverride') {
        if (current !== null) void patch({ airVpdOverride: null });
        return;
      }
      return 'restore';
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n === current) return 'restore';
    void patch({ [key]: n });
  }

  /** Put the stored value back when the edit was not taken, so a cleared box cannot sit blank
   *  against a config that never changed. */
  function commitField(event: Event, key: string, current: number | null): void {
    const input = event.currentTarget as HTMLInputElement;
    if (commitNumber(key, input.value, current) === 'restore') {
      input.value = current === null ? '' : String(current);
    }
  }

  /** Page 1 only while polling, so paging back through history is not yanked to the top. */
  let logOffset = $state(0);

  /** `fresh` takes a new anchor instead of reusing the load-time one. Reusing it forever meant
   *  `WHERE id <= it` hid every row written afterwards, and hid all of them on a fresh install
   *  where the anchor starts at 0. */
  async function loadEvents(offset: number, fresh = false): Promise<boolean> {
    try {
      const anchor = fresh || eventAnchorId === 0 ? '' : `&anchorId=${eventAnchorId}`;
      const res = await fetch(
        `/api/climate/events?limit=${LOG_PAGE_SIZE}&offset=${offset}${anchor}`
      );
      if (!res.ok) return false;
      const body = (await res.json()) as {
        events?: ClimateEventJson[];
        total?: number;
        anchorId?: number;
      };
      events = body.events ?? [];
      if (Number.isInteger(body.total)) eventTotal = body.total as number;
      if (Number.isSafeInteger(body.anchorId)) eventAnchorId = body.anchorId as number;
      logOffset = offset;
      return true;
    } catch {
      return false;
    }
  }

  const num = (v: number | null | undefined, digits = 1) =>
    v === null || v === undefined ? '—' : v.toFixed(digits);
  const ah = (air: { tempC: number; rhPct: number } | null) =>
    air ? absoluteHumidityGPerM3(air.tempC, air.rhPct).toFixed(1) : '—';

  const MODE_HELP: Record<ClimateMode, string> = {
    off: 'The loop stops deciding entirely. Only the switch to off is logged.',
    observe: 'Decides and logs every tick, publishes nothing. The dry run.',
    active: 'Publishes to whichever actuators are armed below.'
  };

  // A switch rather than a ternary chain so switch-exhaustiveness-check covers it too: as a chain
  // a sixth kind compiled fine and fell through to a green 'ok' dot, which is the wrong direction
  // to guess in.
  const actionTone = $derived.by(() => {
    switch (action.kind) {
      case 'blocked':
        return 'alert';
      case 'delegated':
        return 'warn';
      case 'hold':
        return 'muted';
      case 'exhaust':
      case 'humidify':
        return 'ok';
      default:
        return 'muted';
    }
  });

  const actionLabel = $derived.by(() => {
    switch (action.kind) {
      case 'exhaust':
        return `${config.mode === 'active' && exhaustArmed ? 'Exhaust' : 'Would set exhaust'} ${action.on ? 'ON' : 'OFF'}`;
      case 'humidify':
        return `${config.mode === 'active' && rhArmed ? 'Humidifier' : 'Would set humidifier'} ${action.on ? 'ON' : 'OFF'}`;
      case 'delegated':
        return `Delegated — wants ${action.want} ${action.on ? 'ON' : 'OFF'}`;
      case 'blocked':
        return `Blocked — wants ${action.want} ${action.on ? 'ON' : 'OFF'}`;
      case 'hold':
        return 'Holding';
      // Every case above is covered, so this is unreachable for a kind this build knows. It is
      // here for the one that polls in from a newer server while this tab holds older JS.
      default:
        return 'Holding';
    }
  });
</script>

<svelte:head><title>Climate · grow</title></svelte:head>

{#if error}
  <p class="page-error" role="alert">{error}</p>
{/if}

<span class="section-label">Control · leaf-and-air VPD loop</span>
<section class="grid12">
  <div class="panel col-7">
    <div class="panel-head">
      <span class="panel-title">// AIR VPD</span>
      <span class="head-note mono">
        week {climate.week} · {climate.stage} · target {climate.planTarget.toFixed(2)}
        {#if config.airVpdOverride !== null}<span class="override"
            >overridden {config.airVpdOverride.toFixed(2)}</span
          >{/if}
      </span>
    </div>

    <BandGauge
      band={climate.band}
      airVpd={climate.airVpd}
      airVpdFast={climate.airVpdFast}
      leafVpd={climate.leafVpd}
      ventedAirVpd={climate.ventedAirVpd}
    />

    <div class="verdict-row">
      <span class="dot {actionTone === 'ok' ? 'ok' : actionTone === 'muted' ? 'faint' : actionTone}"
      ></span>
      <span class="verdict-label {actionTone}">{actionLabel}</span>
      <span class="verdict-reason">{action.reason}</span>
    </div>
  </div>

  <div class="panel col-5">
    <div class="panel-head">
      <span class="panel-title">// ARMING</span>
      <span class="head-note mono">{climate.exhaust.on ? 'FAN RUNNING' : 'FAN OFF'}</span>
    </div>

    <div class="modes" role="group" aria-label="Loop mode">
      {#each CLIMATE_MODES as mode (mode)}
        <button
          class="ctl mode"
          class:on={config.mode === mode}
          disabled={saving || !isAdmin}
          aria-pressed={config.mode === mode}
          onclick={() => patch({ mode })}
        >
          {mode.toUpperCase()}
        </button>
      {/each}
    </div>
    <p class="hint">{MODE_HELP[config.mode]}</p>
    {#if !isAdmin}
      <p class="hint">Read-only: arming the loop is an admin action.</p>
    {/if}

    <div class="arm">
      <button
        class="ctl ctl-toggle"
        class:on={exhaustArmed}
        disabled={saving || !isAdmin}
        aria-pressed={exhaustArmed}
        onclick={() => setSource('exhaustSource', !exhaustArmed)}
      >
        <span class="ctl-label">Arm Exhaust</span>
        <span class="ctl-state mono">{exhaustArmed ? 'LOOP' : 'FIRMWARE'}</span>
      </button>
      <p class="hint">
        {#if exhaustArmed}
          The loop owns the relay, provided no firmware arm is driving it.
        {:else}
          The plug's own cycle and schedule own the relay. The loop only reports what it would do.
        {/if}
      </p>
      <!-- Shown whether or not the loop is armed: an arm is what stops it taking the relay. -->
      {#if armedArms.length > 0}
        <p class="warn">
          {armedArms.join(' and ')}
          {armedArms.length > 1 ? 'are' : 'is'} driving the relay every ~10 s.
          {#if exhaustArmed}
            Disarm {armedArms.length > 1 ? 'them' : 'it'} in device settings before the loop can take
            it — it will not disarm {armedArms.length > 1 ? 'them' : 'it'} for you, because it cannot
            put {armedArms.length > 1 ? 'them' : 'it'} back if the app stops.
          {/if}
        </p>
      {/if}
    </div>

    <div class="arm">
      <button
        class="ctl ctl-toggle"
        class:on={rhArmed}
        disabled={saving || !isAdmin || !climate.humidifier.present}
        aria-pressed={rhArmed}
        onclick={() => setSource('rhSource', !rhArmed)}
      >
        <span class="ctl-label">Arm RH Control</span>
        <span class="ctl-state mono">{rhArmed ? 'LOOP' : 'EXTERNAL'}</span>
      </button>
      <p class="hint">
        {#if climate.humidifier.present}
          Engages at the {AIR_VPD_HARD_MAX.toFixed(2)} hard ceiling and releases back at the week's target
          — outside the exhaust's range, so the two never fight.
        {:else}
          No humidifier plug discovered. RH stays delegated to the humidistat; a too-high VPD logs
          as <em>delegated</em> rather than vanishing.
        {/if}
      </p>
    </div>
  </div>
</section>

<span class="section-label">Inside vs outside · what venting would do</span>
<section class="grid12">
  <div class="panel col-6">
    <div class="panel-head">
      <span class="panel-title">// AIR</span>
      <span class="head-note mono">{climate.lightsOn ? 'LIGHTS ON' : 'LIGHTS OFF'}</span>
    </div>
    <div class="scroll">
      <table class="air">
        <thead>
          <tr><th></th><th>Temp</th><th>RH</th><th>Abs. humidity</th><th>Source</th></tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Tent</th>
            <td class="mono">{num(climate.tent?.tempC)} °C</td>
            <td class="mono">{num(climate.tent?.rhPct, 0)} %</td>
            <td class="mono">{ah(climate.tent)} g/m³</td>
            <td class="mono sub">{climate.tentNode ?? '—'}</td>
          </tr>
          <tr>
            <th scope="row">Room</th>
            <td class="mono">{num(climate.room?.tempC)} °C</td>
            <td class="mono">{num(climate.room?.rhPct, 0)} %</td>
            <td class="mono">{ah(climate.room)} g/m³</td>
            <td class="mono sub">{climate.roomNode ?? '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="hint">
      Venting moves the tent toward the room's absolute humidity, so that gap — not the temperature
      difference — sizes the lever.
      {#if climate.ventedAirVpd !== null}
        Fully vented, the tent would settle near <strong
          >{climate.ventedAirVpd.toFixed(2)} kPa</strong
        >.
      {:else}
        No room reference right now, so the predictive gate is skipped rather than blocking.
      {/if}
    </p>
  </div>

  <div class="panel col-6">
    <div class="panel-head">
      <span class="panel-title">// BOOK REFERENCE</span>
      <span class="head-note mono">CCI Black Book p.57</span>
    </div>
    <div class="scroll">
      <table class="air">
        <thead>
          <tr><th></th><th>Temp</th><th>RH</th><th>Air VPD</th></tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Lights on</th>
            <td class="mono sub">{climate.climateRef.day.tempC.toFixed(1)} °C</td>
            <td class="mono sub">{climate.climateRef.day.rhPct} %</td>
            <td class="mono" rowspan="2">{climate.planTarget.toFixed(2)}</td>
          </tr>
          <tr>
            <th scope="row">Lights off</th>
            <td class="mono sub">{climate.climateRef.night.tempC.toFixed(1)} °C</td>
            <td class="mono sub">{climate.climateRef.night.rhPct} %</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="hint">
      One VPD figure covers the whole 24 h — the book lets RH fall with the night temperature rather
      than depressing VPD after dark. The temp and RH columns are context only: with no heater and
      no chiller most of that range is unreachable here, so only VPD is regulated.
    </p>
  </div>
</section>

<span class="section-label">Tuning</span>
<section class="grid12">
  <div class="panel col-12">
    <div class="panel-head"><span class="panel-title">// GUARDS</span></div>
    <div class="fields">
      <label>
        <span class="field-label">Deadband ± kPa</span>
        <input
          class="mono"
          type="number"
          step="0.01"
          min="0.01"
          max="0.4"
          value={config.deadbandKpa}
          disabled={saving || !isAdmin}
          onchange={(e) => commitField(e, 'deadbandKpa', config.deadbandKpa)}
        />
        <span class="field-hint">Half-width of the band. The band is the debounce.</span>
      </label>

      <label>
        <span class="field-label">VPD override kPa</span>
        <input
          class="mono"
          type="number"
          step="0.05"
          min="0.8"
          max="1.2"
          value={config.airVpdOverride ?? ''}
          placeholder={climate.planTarget.toFixed(2)}
          disabled={saving || !isAdmin}
          onchange={(e) => commitField(e, 'airVpdOverride', config.airVpdOverride)}
        />
        <span class="field-hint">Blank follows the week's cited target.</span>
      </label>

      <label>
        <span class="field-label">Min on (s)</span>
        <input
          class="mono"
          type="number"
          step="10"
          min="0"
          max="3600"
          value={config.minOnSeconds}
          disabled={saving || !isAdmin}
          onchange={(e) => commitField(e, 'minOnSeconds', config.minOnSeconds)}
        />
        <span class="field-hint">Anti-chatter only. The hard ceiling overrides it.</span>
      </label>

      <label>
        <span class="field-label">Min off (s)</span>
        <input
          class="mono"
          type="number"
          step="10"
          min="0"
          max="3600"
          value={config.minOffSeconds}
          disabled={saving || !isAdmin}
          onchange={(e) => commitField(e, 'minOffSeconds', config.minOffSeconds)}
        />
        <span class="field-hint">Rarely binding — the off leg runs close to an hour.</span>
      </label>

      <label>
        <span class="field-label">Min gain kPa</span>
        <input
          class="mono"
          type="number"
          step="0.01"
          min="0"
          max="1"
          value={config.minGainKpa}
          disabled={saving || !isAdmin}
          onchange={(e) => commitField(e, 'minGainKpa', config.minGainKpa)}
        />
        <span class="field-hint">A start is refused below this predicted improvement.</span>
      </label>

      <label>
        <span class="field-label">Never vent below °C</span>
        <input
          class="mono"
          type="number"
          step="0.5"
          min="5"
          max="30"
          value={config.ventNeverBelowC}
          disabled={saving || !isAdmin}
          onchange={(e) => commitField(e, 'ventNeverBelowC', config.ventNeverBelowC)}
        />
        <span class="field-hint">Cold protection — blocks venting.</span>
      </label>
    </div>
  </div>
</section>

<span class="section-label">Decision log</span>
<section class="grid12">
  <div class="panel col-12">
    <div class="panel-head">
      <span class="panel-title">// ACTIONS</span>
      <span class="head-note mono">{eventTotal} recorded</span>
    </div>
    <ClimateLog {events} total={eventTotal} pageSize={LOG_PAGE_SIZE} onpage={loadEvents} />
  </div>
</section>

<style>
  .section-label {
    display: block;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--faint);
    margin: 22px 0 10px;
  }
  .section-label:first-of-type {
    margin-top: 0;
  }

  /* Defined locally, as the lights page does — Svelte scopes styles, so there is no shared
     grid utility to inherit. */
  .grid12 {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: var(--gap);
    align-items: start;
  }
  .col-5 {
    grid-column: span 5;
  }
  .col-6 {
    grid-column: span 6;
  }
  .col-7 {
    grid-column: span 7;
  }
  .col-12 {
    grid-column: span 12;
  }
  /* Without this every column keeps its twelfth-width fraction and the panels shred. */
  @media (max-width: 960px) {
    .col-5,
    .col-6,
    .col-7,
    .col-12 {
      grid-column: span 12;
    }
  }

  .page-error {
    margin: 0 0 12px;
    padding: 9px 12px;
    border: 1px solid var(--alert);
    border-radius: var(--r-control);
    color: var(--alert);
    font-size: 0.8rem;
  }

  .head-note {
    margin-left: auto;
    font-size: 0.66rem;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .override {
    color: var(--amber);
    margin-left: 6px;
  }

  .verdict-row {
    display: flex;
    align-items: baseline;
    gap: 9px;
    flex-wrap: wrap;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .verdict-label {
    font-size: 0.88rem;
    color: var(--text);
  }
  .verdict-label.ok {
    color: var(--ok);
  }
  .verdict-label.warn {
    color: var(--amber);
  }
  .verdict-label.alert {
    color: var(--alert);
  }
  .verdict-reason {
    font-size: 0.76rem;
    color: var(--muted);
    flex: 1 1 22ch;
  }

  .modes {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .mode {
    flex: 1 1 auto;
    justify-content: center;
  }

  .arm {
    padding-top: 12px;
    margin-top: 12px;
    border-top: 1px solid var(--line);
  }

  .ctl {
    min-height: 34px;
    padding: 4px 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    background: var(--panel-2);
    color: var(--muted);
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .ctl:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .ctl.on {
    border-color: var(--amber);
    background: var(--amber-dim);
    color: var(--amber);
  }
  .ctl-label {
    letter-spacing: 0.04em;
  }
  .ctl-state {
    font-family: var(--font-mono);
    font-size: 0.7rem;
  }

  .hint {
    margin: 7px 0 0;
    font-size: 0.72rem;
    color: var(--faint);
    line-height: 1.45;
  }
  .warn {
    margin: 7px 0 0;
    font-size: 0.72rem;
    color: var(--amber);
  }

  .scroll {
    overflow-x: auto;
  }
  table.air {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }
  table.air th {
    text-align: left;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    padding: 0 12px 7px 0;
    white-space: nowrap;
  }
  table.air tbody th {
    padding: 8px 12px 8px 0;
    color: var(--text);
    font-size: 0.72rem;
  }
  table.air td {
    padding: 8px 12px 8px 0;
    color: var(--text);
    white-space: nowrap;
  }
  table.air thead tr {
    border-bottom: 1px solid var(--line);
  }
  table.air tbody tr + tr {
    border-top: 1px solid var(--line);
  }
  .sub {
    color: var(--muted);
  }

  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 14px 20px;
  }
  .fields label {
    display: grid;
    gap: 5px;
    align-content: start;
  }
  .field-label {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .fields input {
    min-height: 34px;
    padding: 4px 10px;
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    background: var(--panel-2);
    color: var(--text);
    font-size: 0.86rem;
    width: 100%;
  }
  .field-hint {
    font-size: 0.66rem;
    color: var(--faint);
    line-height: 1.4;
  }
</style>
