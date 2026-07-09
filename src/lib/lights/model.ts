import type { EntityConfig, LightRoleRef, Snapshot } from '$lib/server/mqtt/types';

/** Resolve a role reference (node + objectId) to the discovered entity, if any.
 *  Matches the node against either the entity's nodeId or its device identifiers,
 *  mirroring `service.ts:deviceEntity`. */
export function entityByRef(snapshot: Snapshot, ref: LightRoleRef | undefined): EntityConfig | undefined {
  if (!ref) return undefined;
  return snapshot.entities.find(
    (entity) =>
      entity.objectId === ref.objectId &&
      ((entity.nodeId ?? entity.device.identifiers[0]) === ref.node || entity.device.identifiers.includes(ref.node))
  );
}

/** Seconds-of-day from an "HH:MM:SS" (or "HH:MM") wall-clock string; null if unparseable. */
function secondsOfDay(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = match[3] ? Number(match[3]) : 0;
  if (h > 23 || m > 59 || s > 59) return null;
  return h * 3600 + m * 60 + s;
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
 * off. `now` is the browser clock (assumes the browser and the plug share a timezone).
 */
export function computeSchedule(
  onValue: string | null | undefined,
  offValue: string | null | undefined,
  now: Date
): LightScheduleWindow {
  const on = secondsOfDay(onValue);
  const off = secondsOfDay(offValue);
  if (on === null || off === null || on === off) {
    return { hasWindow: false, inWindow: false, next: null, secondsUntil: null };
  }

  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
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

/** "HH:MM:SS"/"HH:MM" → "HH:MM" for an `<input type="time">` value. */
export function toTimeInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
}
