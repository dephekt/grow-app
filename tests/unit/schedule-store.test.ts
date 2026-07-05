import { describe, expect, it } from 'vitest';
import { toScheduleJson, type Schedule } from '../../src/lib/server/opensprinkler/schedules';
import { zonedMinutesToInstant } from '../../src/lib/server/opensprinkler/schedule-time';

const TZ = 'America/Toronto';

function schedule(times: number[], lastFiredAt: string | null = null): Schedule {
  return {
    id: 's1',
    zoneId: 'z1',
    name: null,
    mode: 'time',
    times,
    shotPercent: null,
    shotMl: null,
    shotSeconds: 30,
    enabled: true,
    lastFiredAt,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  };
}

describe('toScheduleJson', () => {
  it('maps times back to HH:MM and reports the next-due instant later today', () => {
    const now = zonedMinutesToInstant(2026, 7, 15, 600, TZ); // 10:00 local, before the 12:00 slot
    const json = toScheduleJson(schedule([720]), now, TZ);
    expect(json.times).toEqual(['12:00']);
    expect(json.nextDueAt).toBe(new Date(zonedMinutesToInstant(2026, 7, 15, 720, TZ)).toISOString());
  });

  it('crosses midnight for the next-due instant', () => {
    const now = zonedMinutesToInstant(2026, 7, 15, 1410, TZ); // 23:30 local; today's 00:30 slot has passed
    const json = toScheduleJson(schedule([30]), now, TZ);
    expect(json.nextDueAt).toBe(new Date(zonedMinutesToInstant(2026, 7, 16, 30, TZ)).toISOString());
  });

  it('reports a null next-due for a schedule with no times', () => {
    const now = zonedMinutesToInstant(2026, 7, 15, 600, TZ);
    expect(toScheduleJson(schedule([]), now, TZ).nextDueAt).toBeNull();
  });
});
