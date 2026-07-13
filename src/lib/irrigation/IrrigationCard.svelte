<script lang="ts">
  import type { LiveSnapshot } from '$lib/live-snapshot-context';
  import type { EntityConfig } from '$lib/server/mqtt/types';
  import {
    resolveEntity,
    openSprinklerAvailability,
    anyStationRunning,
    irrigationDrawing,
    runoffRunning,
    IRRIGATION_NODE,
    RUNOFF_NODE
  } from './model';

  let { live }: { live: LiveSnapshot } = $props();
  const snap = $derived(live.snapshot);

  // Only render once at least one pump plug is discovered. Match on nodeId, not d.id: the ESPHome
  // plugs ship HA-discovery configs with no device `ids`, so devices() can't set d.id to the node
  // name (it lands on a uniq_id/slug), while d.nodeId reliably equals the constant.
  const hasPumps = $derived(snap.devices.some((d) => d.nodeId === IRRIGATION_NODE || d.nodeId === RUNOFF_NODE));

  const osAvail = $derived(openSprinklerAvailability(snap));
  const zoneOpen = $derived(anyStationRunning(snap));
  const osText = $derived(
    osAvail === 'online' ? (zoneOpen ? 'watering' : 'online') : osAvail === 'offline' ? 'offline' : 'not seen'
  );

  interface PumpView {
    offline: boolean;
    running: boolean;
    power: EntityConfig | undefined;
    voltage: EntityConfig | undefined;
    current: EntityConfig | undefined;
    daily: EntityConfig | undefined;
  }

  function deviceOffline(node: string): boolean {
    return snap.devices.find((d) => d.nodeId === node)?.availability === 'offline';
  }

  const irrigation = $derived<PumpView>({
    offline: deviceOffline(IRRIGATION_NODE),
    running: irrigationDrawing(snap),
    power: resolveEntity(snap, { node: IRRIGATION_NODE, objectId: 'pump_power' }),
    voltage: resolveEntity(snap, { node: IRRIGATION_NODE, objectId: 'voltage' }),
    current: resolveEntity(snap, { node: IRRIGATION_NODE, objectId: 'current' }),
    daily: resolveEntity(snap, { node: IRRIGATION_NODE, objectId: 'total_daily_energy' })
  });
  const runoff = $derived<PumpView>({
    offline: deviceOffline(RUNOFF_NODE),
    running: runoffRunning(snap),
    power: resolveEntity(snap, { node: RUNOFF_NODE, objectId: 'runoff_pump_power' }),
    voltage: resolveEntity(snap, { node: RUNOFF_NODE, objectId: 'voltage' }),
    current: resolveEntity(snap, { node: RUNOFF_NODE, objectId: 'current' }),
    daily: resolveEntity(snap, { node: RUNOFF_NODE, objectId: 'total_daily_energy' })
  });

  function fmt(entity: EntityConfig | undefined): string {
    return entity ? live.formatState(entity) : '—';
  }
</script>

{#snippet pumpRow(name: string, pump: PumpView)}
  <div class="pump">
    <div class="pump-head">
      <span class="dot {pump.offline ? 'faint' : pump.running ? 'ok pulse' : ''}"></span>
      <span class="pump-name">{name}</span>
      <span class="pump-state mono" class:run={pump.running && !pump.offline} class:bad={pump.offline}>
        {pump.offline ? 'offline' : pump.running ? 'running' : 'idle'}
      </span>
    </div>
    <div class="metrics">
      <div class="metric"><span class="metric-label">Power</span><span class="metric-value mono">{fmt(pump.power)}</span></div>
      <div class="metric"><span class="metric-label">Voltage</span><span class="metric-value mono">{fmt(pump.voltage)}</span></div>
      <div class="metric"><span class="metric-label">Current</span><span class="metric-value mono">{fmt(pump.current)}</span></div>
      <div class="metric"><span class="metric-label">Today</span><span class="metric-value mono">{fmt(pump.daily)}</span></div>
    </div>
  </div>
{/snippet}

{#if hasPumps}
  <article class="panel irrigation-card">
    <div class="panel-head">
      <span class="panel-title">Irrigation</span>
      <span class="os mono" class:on={osAvail === 'online'} class:bad={osAvail === 'offline'}>
        <span class="dot {osAvail === 'online' ? 'ok' : osAvail === 'offline' ? 'alert' : 'faint'}"></span>
        OpenSprinkler {osText}
      </span>
    </div>

    {@render pumpRow('Irrigation Pump', irrigation)}
    {@render pumpRow('Runoff Pump', runoff)}
  </article>
{/if}

<style>
  .irrigation-card {
    display: grid;
    gap: 14px;
    align-content: start;
  }

  .os {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 0.72rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .os.on {
    color: var(--ok);
  }
  .os.bad {
    color: var(--alert);
  }

  .pump {
    display: grid;
    gap: 9px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }

  .pump-head {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .pump-name {
    font-size: 0.92rem;
    color: var(--text);
  }
  .pump-state {
    margin-left: auto;
    font-size: 0.72rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .pump-state.run {
    color: var(--ok);
  }
  .pump-state.bad {
    color: var(--alert);
  }

  .metrics {
    display: grid;
    /* auto-FIT (not auto-fill): the 4 fields spread to fill the card width instead of
       clustering left with empty trailing columns; wraps on very narrow screens. */
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 8px 16px;
    padding-left: 17px;
  }
  .metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .metric-label {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .metric-value {
    font-size: 0.9rem;
    color: var(--text);
  }
</style>
