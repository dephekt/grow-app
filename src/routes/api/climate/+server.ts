// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authz';
import { getClimateDb } from '$lib/server/climate/db';
import { ClimateConfigError, getClimateConfig, updateClimateConfig } from '$lib/server/climate/store';
import { getClimateLoopState } from '$lib/server/climate/loop';
import { getSiteMqttService } from '$lib/server/mqtt/service';
import { controlBand, type ClimateConfig } from '$lib/climate/model';
import { decideClimate } from '$lib/climate/decide';
import { resolveClimateInputs } from '$lib/climate/inputs';
import { ventedAirVpdKpa } from '$lib/climate/psychro';
import { resolveGrowState } from '$lib/lights/grow-plan';

/**
 * Config, week and the resolved band — a SQLite read and some arithmetic, nothing else.
 *
 * Split out because the dashboard needs only the effective target, and it is the most-loaded
 * route in the app: making it walk the entity list and evaluate the control law on every SSR
 * render and client navigation would be a real cost for two scalars.
 */
function planState() {
  const db = getClimateDb();
  const config = getClimateConfig(db);
  const now = new Date();
  const grow = resolveGrowState(now);
  const target = config.airVpdOverride ?? grow.airVpdTarget;
  return {
    config,
    now,
    grow,
    band: controlBand(target, config.deadbandKpa),
    week: grow.week,
    stage: grow.stage.label,
    planTarget: grow.airVpdTarget,
    climateRef: grow.climateRef
  };
}

export type ClimateBriefState = Omit<ReturnType<typeof planState>, 'now' | 'grow'>;

/**
 * Live loop state: the same inputs, band and verdict the timer is working from, recomputed on
 * read so the page never has to guess. The decision here is a preview — it publishes nothing.
 */
function liveState() {
  const { config, now, grow, band, week, stage, planTarget, climateRef } = planState();

  const inputs = resolveClimateInputs(getSiteMqttService().snapshot(), now.getTime());
  const state = getClimateLoopState();
  // Null when there is no live reading, even if the loop's window still holds one: falling back
  // to a pre-failure median would hand decideClimate a VPD with no tent behind it, skipping the
  // fail-safe and quietly evaluating both temperature limits as false.
  const smoothedAirVpd = inputs.airVpd === null ? null : (state.airVpd.value() ?? inputs.airVpd);
  // Same smoothing the loop applies, so the previewed verdict matches the acted-on one.
  const smoothedTempC = state.tentTempC.value();
  const tent =
    inputs.tent === null || smoothedTempC === null ? inputs.tent : { ...inputs.tent, tempC: smoothedTempC };

  const decision = decideClimate({
    nowMs: now.getTime(),
    config,
    band,
    reading: {
      tent,
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
    armsOn: inputs.arms.filter((a) => a.on).map((a) => a.objectId)
  });

  return {
    config,
    band,
    week,
    stage,
    planTarget,
    climateRef,
    tent,
    room: inputs.room,
    airVpd: smoothedAirVpd,
    instantAirVpd: inputs.airVpd,
    leafVpd: inputs.leafVpd,
    lightsOn: inputs.lightsOn,
    tentNode: inputs.tentNode,
    roomNode: inputs.roomNode,
    // What the tent would settle at if fully ventilated — the gate's own number, shown so a
    // 'blocked' verdict is legible rather than mysterious.
    ventedAirVpd: inputs.room ? ventedAirVpdKpa(inputs.room, inputs.lightsOn) : null,
    exhaust: { present: inputs.exhaust.present, on: inputs.exhaust.on },
    humidifier: { present: inputs.humidifier.present, on: inputs.humidifier.on },
    arms: inputs.arms.map((a) => ({ objectId: a.objectId, on: a.on })),
    action: decision.action
  };
}

export type ClimateLiveState = ReturnType<typeof liveState>;

export const GET: RequestHandler = ({ url }) => {
  // `?brief=1` skips the snapshot walk and the control-law evaluation; see planState.
  if (url.searchParams.has('brief')) {
    const { now: _now, grow: _grow, ...brief } = planState();
    return json({ ok: true, ...brief });
  }
  return json({ ok: true, ...liveState() });
};

const PATCHABLE = [
  'mode',
  'exhaustSource',
  'rhSource',
  'deadbandKpa',
  'minOnSeconds',
  'minOffSeconds',
  'minGainKpa',
  'ventAlwaysAboveC',
  'ventNeverBelowC',
  'airVpdOverride'
] as const;

/** Arming is an admin action: it hands a relay to an automation. */
export const PATCH: RequestHandler = async ({ request, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  const patch: Partial<ClimateConfig> = {};
  for (const key of PATCHABLE) {
    if (body[key] !== undefined) (patch as Record<string, unknown>)[key] = body[key];
  }

  try {
    updateClimateConfig(getClimateDb(), patch, new Date().toISOString());
  } catch (error) {
    if (error instanceof ClimateConfigError) {
      return json({ ok: false, error: error.message }, { status: 400 });
    }
    throw error;
  }
  return json({ ok: true, ...liveState() });
};
