// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * Pure client-side model for the smart-plugs card: which plugs exist, and how to read
 * their relay, arms and metering out of a snapshot. Server types are imported type-only
 * to keep it client-safe.
 */
import { isEntityOffline, resolveEntityRef } from '$lib/entity-match';
import { IRRIGATION_NODE, PUMP_DRAW_MIN_W, RUNOFF_DRAW_MIN_W, RUNOFF_NODE } from '$lib/irrigation/model';
import type { EntityConfig, Snapshot } from '$lib/server/mqtt/types';

export const EXHAUST_NODE = 'exhaust-fan';
export const GROW_LIGHT_NODE = 'grow-light';

/** The exhaust plug's base package floors reported power below 3 W to exactly 0, so any
 *  non-zero reading is already at or above this. */
const METER_FLOOR_W = 3;

/** The lamp idles near zero and runs in the hundreds of watts; anything clear of the meter
 *  floor is a real load. */
const LIGHT_DRAW_MIN_W = 5;

/** A firmware arm that owns the relay. While one is on, the plug re-asserts its own desired
 *  state every 10 s, so a manual toggle reverts — the card has to say so. */
export interface PlugArm {
  objectId: string;
  label: string;
}

export interface PlugSpec {
  node: string;
  label: string;
  /** Relay objectId. Absent means monitor-only — the runoff plug's relay is `internal: true`
   *  in firmware and never published. */
  relay?: string;
  arms?: PlugArm[];
  /** objectId of the watts sensor; these differ per plug (`fan_power`, `pump_power`, …). */
  power: string;
  dailyEnergy: string;
  /** At or above this many watts the load counts as running. */
  runningMinW: number;
  /** True when the load can genuinely run below the meter's floor, making a 0 W reading
   *  inconclusive rather than proof it is idle. The exhaust fan at low speed does this. */
  subFloorDraw?: boolean;
  /** Require a confirmation before toggling. */
  confirmToggle?: boolean;
  /** Shown under the row as standing context. */
  note?: string;
}

export const PLUGS: PlugSpec[] = [
  {
    node: EXHAUST_NODE,
    label: 'Exhaust Fan',
    relay: 'exhaust_fan',
    arms: [
      { objectId: 'fan_cycle', label: 'cycle' },
      { objectId: 'fan_schedule', label: 'schedule' }
    ],
    power: 'fan_power',
    dailyEnergy: 'total_daily_energy',
    runningMinW: METER_FLOOR_W,
    subFloorDraw: true
  },
  {
    node: GROW_LIGHT_NODE,
    label: 'Grow Light',
    relay: 'grow_light',
    arms: [{ objectId: 'light_schedule', label: 'schedule' }],
    power: 'light_power',
    dailyEnergy: 'total_daily_energy',
    runningMinW: LIGHT_DRAW_MIN_W
  },
  {
    node: IRRIGATION_NODE,
    label: 'Irrigation Pump',
    relay: 'irrigation_pump',
    power: 'pump_power',
    dailyEnergy: 'total_daily_energy',
    runningMinW: PUMP_DRAW_MIN_W,
    confirmToggle: true,
    note: 'supply / rearm — switching off disables irrigation'
  },
  {
    node: RUNOFF_NODE,
    label: 'Runoff Pump',
    power: 'runoff_pump_power',
    dailyEnergy: 'total_daily_energy',
    runningMinW: RUNOFF_DRAW_MIN_W,
    note: 'always on — relay is internal to the plug'
  }
];

/**
 * What the load is doing.
 *
 * `indeterminate` exists because the exhaust fan at low speed draws less than the plug's
 * 3 W measurement floor: the relay is closed and the fan is turning, but the meter reports
 * 0 W. Reporting that as `idle` would be a measurement the hardware cannot make.
 */
export type PlugActivity = 'offline' | 'off' | 'running' | 'idle' | 'indeterminate' | 'unknown';

export interface PlugArmView {
  entity: EntityConfig;
  label: string;
  armed: boolean;
}

export interface PlugView {
  spec: PlugSpec;
  present: boolean;
  offline: boolean;
  relay: EntityConfig | undefined;
  relayOn: boolean;
  activity: PlugActivity;
  arms: PlugArmView[];
  /** Any arm on means the firmware will overwrite a manual toggle within ~10 s. */
  armed: boolean;
  power: EntityConfig | undefined;
  dailyEnergy: EntityConfig | undefined;
}

function numericState(snapshot: Snapshot, entity: EntityConfig | undefined): number | null {
  if (!entity) return null;
  const raw = snapshot.states[entity.id]?.value;
  if (raw == null || raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Whether a switch entity currently reads on. */
export function switchIsOn(snapshot: Snapshot, entity: EntityConfig | undefined): boolean {
  if (!entity) return false;
  return (snapshot.states[entity.id]?.value ?? null) === (entity.payloadOn ?? 'ON');
}

export function resolvePlug(snapshot: Snapshot, spec: PlugSpec): PlugView {
  const relay = spec.relay ? resolveEntityRef(snapshot, { node: spec.node, objectId: spec.relay }) : undefined;
  const power = resolveEntityRef(snapshot, { node: spec.node, objectId: spec.power });
  const dailyEnergy = resolveEntityRef(snapshot, { node: spec.node, objectId: spec.dailyEnergy });

  const present = snapshot.devices.some((d) => d.nodeId === spec.node || d.id === spec.node);
  // Any of the plug's own entities answers the availability question identically.
  const offline = isEntityOffline(snapshot, relay ?? power ?? dailyEnergy);

  const arms: PlugArmView[] = (spec.arms ?? [])
    .map((arm) => {
      const entity = resolveEntityRef(snapshot, { node: spec.node, objectId: arm.objectId });
      return entity ? { entity, label: arm.label, armed: switchIsOn(snapshot, entity) } : null;
    })
    .filter((a): a is PlugArmView => a !== null);

  const relayOn = switchIsOn(snapshot, relay);
  const watts = numericState(snapshot, power);

  let activity: PlugActivity;
  if (offline) {
    activity = 'offline';
  } else if (spec.relay && !relay) {
    activity = 'unknown';
  } else if (spec.relay && !relayOn) {
    activity = 'off';
  } else if (watts === null) {
    activity = 'unknown';
  } else if (watts >= spec.runningMinW) {
    activity = 'running';
  } else {
    activity = spec.subFloorDraw ? 'indeterminate' : 'idle';
  }

  return {
    spec,
    present,
    offline,
    relay,
    relayOn,
    activity,
    arms,
    armed: arms.some((a) => a.armed),
    power,
    dailyEnergy
  };
}

export function resolvePlugs(snapshot: Snapshot): PlugView[] {
  return PLUGS.map((spec) => resolvePlug(snapshot, spec)).filter((plug) => plug.present);
}

const ACTIVITY_TEXT: Record<PlugActivity, string> = {
  offline: 'offline',
  off: 'off',
  running: 'running',
  idle: 'idle',
  indeterminate: 'on · draw below meter floor',
  unknown: 'unknown'
};

export function activityText(activity: PlugActivity): string {
  return ACTIVITY_TEXT[activity];
}

/** Dot modifier for a plug row: pulsing green only when the draw is measured. */
export function activityDot(activity: PlugActivity): string {
  if (activity === 'offline') return 'alert';
  if (activity === 'running') return 'ok pulse';
  if (activity === 'idle' || activity === 'indeterminate') return 'ok';
  return 'faint';
}
