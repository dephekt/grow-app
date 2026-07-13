import { describe, expect, it } from 'vitest';
import { RunoffRunTracker } from '../../src/lib/server/opensprinkler/runoff-monitor';

// Default floor 10 W, re-arm after 30 s idle.
describe('RunoffRunTracker', () => {
  it('records a run once on the rising edge of a burst', () => {
    const t = new RunoffRunTracker();
    expect(t.note(22, 1_000_000)).toEqual({ startedAtMs: 1_000_000 });
    expect(t.running).toBe(true);
    // Sustained draw across further samples — no duplicate.
    expect(t.note(24, 1_010_000)).toBeNull();
    expect(t.note(21, 1_020_000)).toBeNull();
  });

  it('records a single-sample burst (runoff runs are short)', () => {
    const t = new RunoffRunTracker();
    expect(t.note(24, 500)).toEqual({ startedAtMs: 500 });
  });

  it('does not re-fire on a brief mid-run sub-floor dip', () => {
    const t = new RunoffRunTracker();
    expect(t.note(22, 0)).toEqual({ startedAtMs: 0 });
    expect(t.note(2, 10_000)).toBeNull(); // dip 10 s < 30 s re-arm window
    expect(t.note(23, 20_000)).toBeNull(); // back up — NOT a new run
  });

  it('re-arms after sustained idle and records the next run', () => {
    const t = new RunoffRunTracker();
    expect(t.note(22, 0)).toEqual({ startedAtMs: 0 });
    t.note(0, 10_000); // idle 10 s since last draw — still disarmed
    t.note(0, 41_000); // idle 41 s ≥ 30 s — re-armed
    expect(t.running).toBe(false);
    expect(t.note(25, 60_000)).toEqual({ startedAtMs: 60_000 });
  });

  it('rejects sub-floor and non-numeric readings', () => {
    const t = new RunoffRunTracker();
    expect(t.note(9, 0)).toBeNull(); // below the 10 W floor
    expect(t.note(NaN, 0)).toBeNull();
    expect(t.running).toBe(false);
  });
});
