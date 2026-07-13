import { describe, expect, it } from 'vitest';
import { RunoffRunTracker } from '../../src/lib/server/opensprinkler/runoff-monitor';

// Default floor 10 W, arm after 30 s idle. The tracker starts DISARMED — it must observe the pump
// idle before it will record a run.
describe('RunoffRunTracker', () => {
  it('records a run once on the rising edge, after an idle sample arms it', () => {
    const t = new RunoffRunTracker();
    t.note(0, 990_000); // startup idle → arm
    expect(t.note(22, 1_000_000)).toEqual({ startedAtMs: 1_000_000 });
    // Sustained draw across further samples — no duplicate.
    expect(t.note(24, 1_010_000)).toBeNull();
    expect(t.note(21, 1_020_000)).toBeNull();
  });

  it('records a single-sample burst (runoff runs are short)', () => {
    const t = new RunoffRunTracker();
    t.note(0, 0); // arm
    expect(t.note(24, 500)).toEqual({ startedAtMs: 500 });
  });

  it('does not fire for a run already in progress at startup (restart mid-run)', () => {
    const t = new RunoffRunTracker();
    // First samples after a restart are already above-floor — never saw it idle, so no insert.
    expect(t.note(22, 0)).toBeNull();
    expect(t.note(24, 10_000)).toBeNull();
    // Pump stops, idles long enough, then a genuinely new run fires.
    t.note(0, 20_000);
    t.note(0, 55_000); // idle ≥ 30 s → armed
    expect(t.note(23, 60_000)).toEqual({ startedAtMs: 60_000 });
  });

  it('does not split one continuous run when above-floor samples arrive far apart', () => {
    const t = new RunoffRunTracker();
    t.note(0, 0); // arm
    expect(t.note(22, 10_000)).toEqual({ startedAtMs: 10_000 }); // run starts
    // Sparse/dropped reports during a steady draw — no intervening idle sample.
    expect(t.note(22, 70_000)).toBeNull(); // 60 s later, still the same run — NOT a duplicate
    expect(t.note(23, 130_000)).toBeNull();
  });

  it('does not re-fire on a brief mid-run sub-floor dip', () => {
    const t = new RunoffRunTracker();
    t.note(0, 0); // arm
    expect(t.note(22, 10_000)).toEqual({ startedAtMs: 10_000 });
    expect(t.note(2, 20_000)).toBeNull(); // dip 10 s < 30 s — does not arm
    expect(t.note(23, 30_000)).toBeNull(); // back up — NOT a new run
  });

  it('arms again only after sustained idle and records the next run', () => {
    const t = new RunoffRunTracker();
    t.note(0, 0); // arm
    expect(t.note(22, 10_000)).toEqual({ startedAtMs: 10_000 });
    t.note(0, 20_000); // idle 10 s since last draw — still disarmed
    t.note(0, 45_000); // idle 35 s ≥ 30 s — re-armed
    expect(t.note(25, 60_000)).toEqual({ startedAtMs: 60_000 });
  });

  it('rejects sub-floor and non-numeric readings', () => {
    const t = new RunoffRunTracker();
    expect(t.note(9, 0)).toBeNull(); // below the 10 W floor (also arms via the idle branch)
    expect(t.note(NaN, 5_000)).toBeNull();
  });
});
