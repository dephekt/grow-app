// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { DatabaseSync } from 'node:sqlite';
import { intEnv } from '$lib/server/env';
import { getSiteMqttService } from '$lib/server/mqtt/service';
import type { Snapshot } from '$lib/server/mqtt/types';
import { resolveGrowState } from '$lib/lights/grow-plan';
import { controlBand, type ClimateConfig, type ControlBand } from '$lib/climate/model';
import { decideClimate, type ClimateAction, type ClimateDecision } from '$lib/climate/decide';
import { resolveClimateInputs, type ClimateInputs } from '$lib/climate/inputs';
import { RollingMedian } from '$lib/climate/smoothing';
import { getClimateDb } from './db';
import { getClimateConfig, recordClimateEvent } from './store';

/** Median window for the control input. Long enough to swallow a single bad SHT45 sample,
 *  far shorter than the tent's ~20 min exchange time constant, so it costs no responsiveness. */
const SMOOTHING_WINDOW_MS = 5 * 60 * 1000;

/** A quiet loop still says so on this cadence, so a gap in the log means an outage rather
 *  than a decision nobody recorded. */
const HEARTBEAT_MS = 15 * 60 * 1000;

/** Cross-tick state: the smoothing window, when each relay last moved, and what was last
 *  written to the log. Held here rather than in the DB because all of it is re-derivable
 *  and a restart should simply resume observing. */
export class ClimateLoopState {
  readonly airVpd = new RollingMedian(SMOOTHING_WINDOW_MS);
  exhaustOn: boolean | null = null;
  exhaustChangedMs: number | null = null;
  humidifierOn: boolean | null = null;
  humidifierChangedMs: number | null = null;
  private lastLogKey: string | null = null;
  private lastLogMs: number | null = null;

  /** Record observed relay positions, stamping a change time only on an actual transition —
   *  including one the loop did not cause, since a hand-flipped relay restarts its timers too. */
  noteRelays(exhaustOn: boolean, humidifierOn: boolean, nowMs: number): void {
    if (this.exhaustOn !== exhaustOn) {
      // A cold start is not a transition: leaving the stamp null lets the first decision act
      // immediately rather than serving out a minimum the loop never observed the start of.
      if (this.exhaustOn !== null) this.exhaustChangedMs = nowMs;
      this.exhaustOn = exhaustOn;
    }
    if (this.humidifierOn !== humidifierOn) {
      if (this.humidifierOn !== null) this.humidifierChangedMs = nowMs;
      this.humidifierOn = humidifierOn;
    }
  }

  /** Whether this action is worth a row: any change of verdict, else the heartbeat. */
  shouldLog(action: ClimateAction, nowMs: number): boolean {
    const key = logKey(action);
    if (key !== this.lastLogKey) return true;
    return this.lastLogMs === null || nowMs - this.lastLogMs >= HEARTBEAT_MS;
  }

  markLogged(action: ClimateAction, nowMs: number): void {
    this.lastLogKey = logKey(action);
    this.lastLogMs = nowMs;
  }
}

/** Dedup identity of a verdict. Deliberately excludes the reason text, which carries live
 *  numbers and would make every tick look like a new decision. */
function logKey(action: ClimateAction): string {
  switch (action.kind) {
    case 'exhaust':
    case 'humidify':
      return `${action.kind}:${action.on}`;
    case 'delegated':
    case 'blocked':
      return `${action.kind}:${action.want}`;
    default:
      return 'hold';
  }
}

export interface ClimateTickDeps {
  db: DatabaseSync;
  snapshot: Snapshot;
  state: ClimateLoopState;
  nowMs: number;
  /** Injected so a test drives publishing without a broker. */
  publish: (entityId: string, on: boolean) => Promise<void>;
  canPublish: () => boolean;
}

export interface ClimateTickResult {
  config: ClimateConfig;
  band: ControlBand;
  inputs: ClimateInputs;
  smoothedAirVpd: number | null;
  decision: ClimateDecision;
  published: boolean;
}

/** One reconciliation pass: read the world, decide, publish if armed, log if it changed. */
export async function runClimateTick(deps: ClimateTickDeps): Promise<ClimateTickResult> {
  const { db, snapshot, state, nowMs, publish, canPublish } = deps;

  const config = getClimateConfig(db);
  const grow = resolveGrowState(new Date(nowMs));
  const target = config.airVpdOverride ?? grow.airVpdTarget;
  const band = controlBand(target, config.deadbandKpa);

  const inputs = resolveClimateInputs(snapshot);
  if (inputs.airVpd === null) state.airVpd.reset();
  else state.airVpd.push(inputs.airVpd, nowMs);
  const smoothedAirVpd = state.airVpd.value();

  state.noteRelays(inputs.exhaust.on, inputs.humidifier.on, nowMs);

  const decision = decideClimate({
    nowMs,
    config,
    band,
    reading: {
      tent: inputs.tent,
      room: inputs.room,
      airVpd: smoothedAirVpd,
      leafVpd: inputs.leafVpd,
      lightsOn: inputs.lightsOn
    },
    exhaust: { present: inputs.exhaust.present, on: inputs.exhaust.on, lastChangeMs: state.exhaustChangedMs },
    humidifier: {
      present: inputs.humidifier.present,
      on: inputs.humidifier.on,
      lastChangeMs: state.humidifierChangedMs
    },
    armsOn: inputs.arms.filter((arm) => arm.on).map((arm) => arm.objectId)
  });

  const { action } = decision;
  let published = false;

  // `observe` is the whole point of the dry run: it decides and logs but never publishes.
  if (config.mode === 'active' && canPublish()) {
    for (const objectId of decision.reconcileArms) {
      const arm = inputs.arms.find((a) => a.objectId === objectId);
      if (arm) await publish(arm.entity.id, false);
    }
    if (action.kind === 'exhaust' && inputs.exhaust.entity) {
      await publish(inputs.exhaust.entity.id, action.on);
      published = true;
    } else if (action.kind === 'humidify' && inputs.humidifier.entity) {
      await publish(inputs.humidifier.entity.id, action.on);
      published = true;
    }
  }

  if (state.shouldLog(action, nowMs)) {
    recordClimateEvent(db, {
      ts: new Date(nowMs).toISOString(),
      action,
      mode: config.mode,
      published,
      airVpd: smoothedAirVpd,
      leafVpd: inputs.leafVpd,
      target,
      bandLow: band.low,
      bandHigh: band.high,
      tentTempC: inputs.tent?.tempC ?? null,
      tentRhPct: inputs.tent?.rhPct ?? null,
      roomTempC: inputs.room?.tempC ?? null,
      roomRhPct: inputs.room?.rhPct ?? null,
      lightsOn: inputs.lightsOn
    });
    state.markLogged(action, nowMs);
  }

  return { config, band, inputs, smoothedAirVpd, decision, published };
}

/** Tick interval in ms (`GROW_CLIMATE_TICK_SECONDS`, default 30s, floored at 5s). */
export function getClimateTickMs(): number {
  return Math.max(5, intEnv('GROW_CLIMATE_TICK_SECONDS', 30)) * 1000;
}

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
const loopState = new ClimateLoopState();

/** Exposed so /climate can render the same smoothed value and relay timers the loop decided on. */
export function getClimateLoopState(): ClimateLoopState {
  return loopState;
}

async function tickOnce(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const service = getSiteMqttService();
    await runClimateTick({
      db: getClimateDb(),
      snapshot: service.snapshot(),
      state: loopState,
      nowMs: Date.now(),
      // Confirmation is a UI double-check for a human; the loop has already decided.
      publish: (entityId, on) => service.publishCommand(entityId, { value: on, confirm: true }),
      canPublish: () => service.brokerConnected()
    });
  } finally {
    ticking = false;
  }
}

/** Start the climate timer, unref'd so it cannot hold the process alive on shutdown. */
export function startClimateLoop(): void {
  if (timer) return;
  timer = setInterval(() => {
    void tickOnce().catch((error) => console.error('[climate] tick failed', error));
  }, getClimateTickMs());
  timer.unref?.();
}

export function stopClimateLoop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
