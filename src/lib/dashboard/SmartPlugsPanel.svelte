<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Daniel Snider -->

<script lang="ts">
  import type { LiveSnapshot } from '$lib/live-snapshot-context';
  import type { EntityConfig } from '$lib/server/mqtt/types';
  import { activityDot, activityText, resolvePlugs, type PlugView } from '$lib/plugs/model';

  let { live }: { live: LiveSnapshot } = $props();
  const snap = $derived(live.snapshot);

  // Only render once at least one plug is discovered, matching the irrigation card. Without
  // this the panel is an empty box on a site that has no plugs.
  const plugs = $derived(resolvePlugs(snap));

  function fmt(entity: EntityConfig | undefined): string {
    return entity ? live.formatState(entity) : '—';
  }

  function toggle(plug: PlugView): void {
    if (!plug.relay) return;
    if (plug.spec.confirmToggle) {
      const next = plug.relayOn ? 'OFF' : 'ON';
      if (!confirm(`Switch ${plug.spec.label} ${next}?\n\n${plug.spec.note ?? ''}`.trim())) return;
    }
    void live.sendCommand(plug.relay, !plug.relayOn);
  }
</script>

{#if plugs.length > 0}
  <div class="panel plugs-panel">
    <div class="panel-head">
      <span class="panel-title">// SMART PLUGS</span>
    </div>

    <div class="plugs">
      {#each plugs as plug (plug.spec.node)}
        {@const error = plug.relay ? (live.commandErrors[plug.relay.id] ?? '') : ''}
        <div class="plug">
          <div class="plug-head">
            <span class="dot {activityDot(plug.activity)}"></span>
            <span class="plug-name">{plug.spec.label}</span>
            <span
              class="plug-state mono"
              class:run={plug.activity === 'running'}
              class:bad={plug.activity === 'offline'}
            >
              {activityText(plug.activity)}
            </span>
          </div>

          <div class="metrics">
            <div class="metric">
              <span class="metric-label">Power</span><span class="metric-value mono">{fmt(plug.power)}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Today</span><span class="metric-value mono">{fmt(plug.dailyEnergy)}</span>
            </div>
          </div>

          <div class="controls">
            {#if plug.relay}
              <button
                type="button"
                class="ctl ctl-toggle"
                class:on={plug.relayOn}
                aria-pressed={plug.relayOn}
                disabled={plug.offline || live.commandPending[plug.relay.id]}
                onclick={() => toggle(plug)}
              >
                <span class="ctl-label">{plug.spec.label}</span>
                <span class="ctl-state">{plug.relayOn ? 'On' : 'Off'}</span>
              </button>
            {:else}
              <span class="monitor-only mono">monitor only</span>
            {/if}
          </div>

          {#if plug.arms.length > 0}
            <p class="arms mono">
              {#each plug.arms as arm (arm.entity.id)}
                <span class="arm" class:armed={arm.armed}>{arm.label} {arm.armed ? 'ARMED' : 'disarmed'}</span>
              {/each}
            </p>
          {/if}

          {#if plug.armed}
            <!-- The plug re-asserts its own desired state every 10 s while an arm is on, so a
                 toggle from here is silently reverted. This is the confusion the card exists for. -->
            <p class="warn">A manual toggle reverts within ~10 s while armed. Disarm to take lasting control.</p>
          {:else if plug.spec.note}
            <p class="note">{plug.spec.note}</p>
          {/if}

          {#if error}
            <p class="cmd-error" role="alert">{error}</p>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .plugs {
    display: grid;
    /* auto-fit so the plugs spread across the full row rather than clustering left. */
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 14px 20px;
  }

  .plug {
    display: grid;
    gap: 9px;
    align-content: start;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }

  .plug-head {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .plug-name {
    font-size: 0.92rem;
    color: var(--text);
  }
  .plug-state {
    margin-left: auto;
    font-size: 0.72rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .plug-state.run {
    color: var(--ok);
  }
  .plug-state.bad {
    color: var(--alert);
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
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

  .controls {
    padding-left: 17px;
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
    cursor: wait;
    opacity: 0.55;
  }
  .ctl-toggle.on {
    border-color: var(--amber);
    background: var(--amber-dim);
    color: var(--amber);
  }
  .ctl-label {
    letter-spacing: 0.04em;
  }
  .ctl-state {
    font-family: var(--font-mono);
  }

  .monitor-only {
    font-size: 0.72rem;
    color: var(--faint);
  }

  .arms {
    margin: 0;
    padding-left: 17px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: 0.68rem;
    color: var(--faint);
  }
  .arm.armed {
    color: var(--amber);
  }

  .warn {
    margin: 0;
    padding-left: 17px;
    font-size: 0.72rem;
    color: var(--amber);
  }

  .note {
    margin: 0;
    padding-left: 17px;
    font-size: 0.72rem;
    color: var(--faint);
  }

  .cmd-error {
    margin: 0;
    padding-left: 17px;
    font-size: 0.78rem;
    color: var(--alert);
  }
</style>
