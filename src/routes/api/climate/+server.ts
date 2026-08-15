// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authz';
import { getClimateDb } from '$lib/server/climate/db';
import { ClimateConfigError, getClimateConfig, updateClimateConfig } from '$lib/server/climate/store';
import { buildDecisionInput, getClimateLoopState } from '$lib/server/climate/loop';
import { getSiteMqttService } from '$lib/server/mqtt/service';
import { controlBand, type ClimateConfig } from '$lib/climate/model';
import { decideClimate } from '$lib/climate/decide';
import { resolveClimateInputs } from '$lib/climate/inputs';
import { resolveGrowState } from '$lib/lights/grow-plan';

/** Config, week and band — a SQLite read and arithmetic, so the dashboard is not made to walk
 *  the entity list and run the control law for two scalars. */
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

/** The inputs, band and verdict the timer is working from; a preview that publishes nothing. */
function liveState() {
  const { config, now, grow, band, week, stage, planTarget, climateRef } = planState();

  const inputs = resolveClimateInputs(getSiteMqttService().snapshot(), now.getTime());
  const state = getClimateLoopState();
  // The loop's own assembler, and read-only: a page refresh must not advance its state.
  const decisionInput = buildDecisionInput(inputs, state, config, band, now.getTime());
  const action = decideClimate(decisionInput);

  return {
    config,
    band,
    week,
    stage,
    planTarget,
    climateRef,
    // Both smoothed, so the AIR table and the vented prediction below it are the same reading.
    tent: decisionInput.reading.tent,
    room: decisionInput.reading.room,
    airVpd: decisionInput.reading.airVpd,
    leafVpd: inputs.leafVpd,
    lightsOn: inputs.lightsOn,
    tentNode: inputs.tentNode,
    roomNode: inputs.roomNode,
    // The gate's own number, shown so a 'blocked' verdict is legible rather than mysterious.
    ventedAirVpd: decisionInput.reading.ventedAirVpd,
    exhaust: { present: inputs.exhaust.present, on: inputs.exhaust.on },
    humidifier: { present: inputs.humidifier.present, on: inputs.humidifier.on },
    arms: inputs.arms.map((a) => ({ objectId: a.objectId, on: a.on })),
    action
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
    const parsed: unknown = await request.json();
    // A bare `null` or an array parses without throwing, then indexing it does.
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
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
