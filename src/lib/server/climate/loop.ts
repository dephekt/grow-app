// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { DatabaseSync } from 'node:sqlite';
import { intEnv } from '$lib/server/env';
import { getSiteMqttService } from '$lib/server/mqtt/service';
import type { Snapshot } from '$lib/server/mqtt/types';
import { resolveGrowState } from '$lib/lights/grow-plan';
import { controlBand, type ClimateConfig, type ControlBand } from '$lib/climate/model';
import { decideClimate, type ClimateAction, type ClimateDecisionInput } from '$lib/climate/decide';
import { resolveClimateInputs, type ClimateInputs } from '$lib/climate/inputs';
import { airVpdKpa, ventedAirVpdKpa, type AirState } from '$lib/climate/psychro';
import { RollingMedian } from '$lib/climate/smoothing';
import { getClimateDb } from './db';
import { getClimateConfig, pruneClimateEvents, recordClimateEvent } from './store';

/** Median window for the control inputs: long enough to swallow one bad sample, far shorter
 *  than the tent's ~20 min exchange time constant. */
const SMOOTHING_WINDOW_MS = 5 * 60 * 1000;

/** A quiet loop still says so on this cadence, so a gap in the log means an outage. */
const HEARTBEAT_MS = 15 * 60 * 1000;

/** Samples the window needs before its median can reject an outlier rather than be one. */
export const MIN_SMOOTHING_SAMPLES = 3;

/** Cross-tick state, held in memory because all of it is re-derivable on restart. */
export class ClimateLoopState {
  /** The MEASUREMENTS are smoothed and everything else derived from them, so a logged row can
   *  be replayed. */
  readonly tentTempC = new RollingMedian(SMOOTHING_WINDOW_MS);
  readonly tentRhPct = new RollingMedian(SMOOTHING_WINDOW_MS);
  readonly roomTempC = new RollingMedian(SMOOTHING_WINDOW_MS);
  readonly roomRhPct = new RollingMedian(SMOOTHING_WINDOW_MS);
  exhaustOn: boolean | null = null;
  exhaustChangedMs: number | null = null;
  humidifierOn: boolean | null = null;
  humidifierChangedMs: number | null = null;
  private lastLogKey: string | null = null;
  private lastLogMs: number | null = null;

  /** Stamp a change only on a real transition, including one the loop did not cause — a
   *  hand-flipped relay restarts its timers too. */
  noteRelays(
    exhaust: { present: boolean; on: boolean },
    humidifier: { present: boolean; on: boolean },
    nowMs: number
  ): void {
    // An undiscovered plug reads OFF, which is absence, not a position.
    if (exhaust.present && this.exhaustOn !== exhaust.on) {
      // A cold start is not a transition, so the stamp stays null and the first action goes.
      if (this.exhaustOn !== null) this.exhaustChangedMs = nowMs;
      this.exhaustOn = exhaust.on;
    }
    if (humidifier.present && this.humidifierOn !== humidifier.on) {
      if (this.humidifierOn !== null) this.humidifierChangedMs = nowMs;
      this.humidifierOn = humidifier.on;
    }
  }

  /** Whether this action is worth a row: any change of verdict, else the heartbeat. */
  shouldLog(action: ClimateAction, nowMs: number, heartbeat = true): boolean {
    const key = logKey(action);
    if (key !== this.lastLogKey) return true;
    if (!heartbeat) return false;
    return this.lastLogMs === null || nowMs - this.lastLogMs >= HEARTBEAT_MS;
  }

  markLogged(action: ClimateAction, nowMs: number): void {
    this.lastLogKey = logKey(action);
    this.lastLogMs = nowMs;
  }
}

/** Dedup identity: the kind plus the reason with its numbers blanked, since `hold` covers
 *  outcomes as unalike as in-band and failing safe. */
function logKey(action: ClimateAction): string {
  const shape = action.reason.replace(/[\d.]+/g, '#');
  switch (action.kind) {
    case 'exhaust':
    case 'humidify':
      return `${action.kind}:${action.on}:${shape}`;
    case 'delegated':
    case 'blocked':
      return `${action.kind}:${action.want}:${action.on}:${shape}`;
    default:
      return `hold:${shape}`;
  }
}

/** Feed this tick's readings into the smoothing windows. The loop calls this; readers do not,
 *  so a page refresh cannot advance the state the loop decides on. */
export function updateClimateSmoothing(state: ClimateLoopState, inputs: ClimateInputs, nowMs: number): void {
  pushAir(state.tentTempC, state.tentRhPct, inputs.tent, nowMs);
  pushAir(state.roomTempC, state.roomRhPct, inputs.room, nowMs);
}

function pushAir(t: RollingMedian, h: RollingMedian, live: AirState | null, nowMs: number): void {
  if (live === null) {
    t.reset();
    h.reset();
    return;
  }
  t.push(live.tempC, nowMs);
  h.push(live.rhPct, nowMs);
}

/** The smoothed pair, or null when there is no live reading — a window must never outlive its
 *  sensor. */
function smoothedAir(t: RollingMedian, h: RollingMedian, live: AirState | null, nowMs: number): AirState | null {
  if (live === null) return null;
  return { tempC: t.value(nowMs) ?? live.tempC, rhPct: h.value(nowMs) ?? live.rhPct };
}

/** Shared with /api/climate so the page previews the decision the loop actually reaches. */
export function buildDecisionInput(
  inputs: ClimateInputs,
  state: ClimateLoopState,
  config: ClimateConfig,
  band: ControlBand,
  nowMs: number
): ClimateDecisionInput {
  const tent = smoothedAir(state.tentTempC, state.tentRhPct, inputs.tent, nowMs);
  const room = smoothedAir(state.roomTempC, state.roomRhPct, inputs.room, nowMs);
  // Derived, so airVpdKpa(logged tent pair) === logged air_vpd exactly.
  const airVpd = tent === null ? null : airVpdKpa(tent.tempC, tent.rhPct);
  const ventedAirVpd = room === null ? null : ventedAirVpdKpa(room, inputs.lightsOn);

  return {
    nowMs,
    config,
    band,
    reading: {
      tent,
      room,
      airVpd,
      ventedAirVpd,
      leafVpd: inputs.leafVpd,
      lightsOn: inputs.lightsOn,
      warmingUp: tent !== null && state.tentTempC.count(nowMs) < MIN_SMOOTHING_SAMPLES
    },
    exhaust: { present: inputs.exhaust.present, on: inputs.exhaust.on, lastChangeMs: state.exhaustChangedMs },
    humidifier: {
      present: inputs.humidifier.present,
      on: inputs.humidifier.on,
      lastChangeMs: state.humidifierChangedMs
    },
    armsOn: inputs.arms.filter((arm) => arm.on).map((arm) => arm.objectId)
  };
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
  decisionInput: ClimateDecisionInput;
  decision: ClimateAction;
  published: boolean;
}

/** One reconciliation pass: read the world, decide, publish if armed, log if it changed. */
export async function runClimateTick(deps: ClimateTickDeps): Promise<ClimateTickResult> {
  const { db, snapshot, state, nowMs, publish, canPublish } = deps;

  const config = getClimateConfig(db);
  const grow = resolveGrowState(new Date(nowMs));
  const target = config.airVpdOverride ?? grow.airVpdTarget;
  const band = controlBand(target, config.deadbandKpa);

  const inputs = resolveClimateInputs(snapshot, nowMs);
  updateClimateSmoothing(state, inputs, nowMs);
  state.noteRelays(inputs.exhaust, inputs.humidifier, nowMs);

  const decisionInput = buildDecisionInput(inputs, state, config, band, nowMs);
  const action = decideClimate(decisionInput);

  let published = false;
  let publishError: string | null = null;

  // Recorded explicitly, or an outage reads as a deliberate dry run.
  const wouldPublish = action.kind === 'exhaust' || action.kind === 'humidify';
  if (config.mode === 'active' && !canPublish() && wouldPublish) {
    publishError = 'broker not connected';
  }

  if (config.mode === 'active' && canPublish()) {
    // Caught, or the log skips exactly the tick that failed to move the relay.
    try {
      if (action.kind === 'exhaust' && inputs.exhaust.entity) {
        await publish(inputs.exhaust.entity.id, action.on);
        published = true;
      } else if (action.kind === 'humidify' && inputs.humidifier.entity) {
        await publish(inputs.humidifier.entity.id, action.on);
        published = true;
      }
    } catch (error) {
      publishError = error instanceof Error ? error.message : String(error);
    }
  }

  // Appended to the reason, which logKey digit-blanks into the dedup key, so a failing publish
  // is a distinct verdict rather than a silent repeat.
  const logged: ClimateAction = publishError
    ? { ...action, reason: `${action.reason} · publish failed: ${publishError}` }
    : action;

  // A switched-off loop records the switch and goes quiet rather than heartbeating forever.
  if (state.shouldLog(logged, nowMs, config.mode !== 'off')) {
    recordClimateEvent(db, {
      ts: new Date(nowMs).toISOString(),
      action: logged,
      mode: config.mode,
      // Strictly whether THIS action reached the broker.
      published,
      airVpd: decisionInput.reading.airVpd,
      leafVpd: inputs.leafVpd,
      target,
      bandLow: band.low,
      bandHigh: band.high,
      // The smoothed pairs the verdict was reached on, so the row can be replayed.
      tentTempC: decisionInput.reading.tent?.tempC ?? null,
      tentRhPct: decisionInput.reading.tent?.rhPct ?? null,
      roomTempC: decisionInput.reading.room?.tempC ?? null,
      roomRhPct: decisionInput.reading.room?.rhPct ?? null,
      lightsOn: inputs.lightsOn
    });
    state.markLogged(logged, nowMs);
    // On write, since writes are the only thing that grows the table.
    pruneClimateEvents(db, nowMs, getClimateLogRetentionDays());
  }

  return { config, band, inputs, decisionInput, decision: action, published };
}

/** Decision-log retention in days (`GROW_CLIMATE_LOG_RETENTION_DAYS`, 0 disables). */
export function getClimateLogRetentionDays(): number {
  return intEnv('GROW_CLIMATE_LOG_RETENTION_DAYS', 90);
}

/** Tick interval in ms (`GROW_CLIMATE_TICK_SECONDS`, default 30s, floored at 5s). */
export function getClimateTickMs(): number {
  return Math.max(5, intEnv('GROW_CLIMATE_TICK_SECONDS', 30)) * 1000;
}

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
const loopState = new ClimateLoopState();

/** Exposed so /climate previews the same smoothed values and relay timers the loop decided on. */
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
