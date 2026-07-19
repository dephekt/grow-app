import type { EntityConfig, LightRoleRef, Snapshot } from '$lib/server/mqtt/types';
import { parseTimeParts } from '$lib/time-entity';

/** Resolve a role reference (node + objectId) to the discovered entity, if any.
 *  Strict (node, objectId) pairing: the ref's node must match the entity's own
 *  node (its `nodeId`, or the device's primary identifier as a fallback), never a
 *  secondary device identifier — that keeps role resolution unambiguous even when
 *  two nodes share a device grouping. Intentionally stricter than
 *  `service.ts:deviceEntity`, which keeps a broader match on purpose. */
export function entityByRef(snapshot: Snapshot, ref: LightRoleRef | undefined): EntityConfig | undefined {
  if (!ref) return undefined;
  return snapshot.entities.find(
    (entity) => entity.objectId === ref.objectId && (entity.nodeId ?? entity.device.identifiers[0]) === ref.node
  );
}

/** Seconds-of-day from a raw `time` entity state value — either the ESPHome JSON
 *  blob or an "HH:MM:SS"/"HH:MM" clock string; null if unparseable. */
function secondsOfDay(value: string | null | undefined): number | null {
  const parts = parseTimeParts(value);
  if (parts === null) return null;
  return parts.hour * 3600 + parts.minute * 60 + parts.second;
}

/** A light's on/off hour split from its schedule times ("18 on / 6 off"), or null if unparseable.
 *  Window length is the half-open [on, off) span, wrapping midnight. Shared by the light control and
 *  the grow-plan card so the two can't compute the photoperiod differently. */
export function photoperiodHours(
  onValue: string | null | undefined,
  offValue: string | null | undefined
): { onHours: number; offHours: number } | null {
  const on = secondsOfDay(onValue);
  const off = secondsOfDay(offValue);
  if (on === null || off === null) return null;
  const windowSec = (off - on + 86400) % 86400;
  const onHours = Math.round(windowSec / 3600);
  return { onHours, offHours: 24 - onHours };
}

export interface LightScheduleWindow {
  /** Both times parsed and on != off — the firmware's "empty window" is on == off. */
  hasWindow: boolean;
  /** The relay should be on now, per the half-open [on, off) window (wraps midnight). */
  inWindow: boolean;
  next: 'on' | 'off' | null;
  secondsUntil: number | null;
}

/**
 * Replicate the firmware photoperiod window (`grow-light.yaml apply_light_schedule`):
 * half-open `[on, off)` in local wall time, may wrap midnight, `on == off` = always
 * off. The firmware's on/off times are the plug's wall clock, which is the site
 * timezone (`tz`), so `now` is projected into that zone rather than read off the
 * browser clock — the countdown is correct even when the viewer sits in another zone.
 */
export function computeSchedule(
  onValue: string | null | undefined,
  offValue: string | null | undefined,
  now: Date,
  tz: string
): LightScheduleWindow {
  const on = secondsOfDay(onValue);
  const off = secondsOfDay(offValue);
  if (on === null || off === null || on === off) {
    return { hasWindow: false, inWindow: false, next: null, secondsUntil: null };
  }

  const wall = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(now);
  const part = (type: 'hour' | 'minute' | 'second') => Number(wall.find((p) => p.type === type)?.value ?? 0);
  const nowSec = part('hour') * 3600 + part('minute') * 60 + part('second');
  const inWindow = on < off ? nowSec >= on && nowSec < off : nowSec >= on || nowSec < off;
  const boundary = inWindow ? off : on;
  const secondsUntil = (boundary - nowSec + 86400) % 86400;

  return { hasWindow: true, inWindow, next: inWindow ? 'off' : 'on', secondsUntil };
}

/** "5:46" for durations ≥ 1 h, "46:12" for shorter ones. */
export function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
