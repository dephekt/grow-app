import { describe, expect, it } from 'vitest';
import { RunoffRunTracker } from '../../src/lib/server/opensprinkler/runoff-monitor';

describe('RunoffRunTracker', () => {
  it('emits a completed run on the ON→OFF edge with the measured duration', () => {
    const t = new RunoffRunTracker();
    expect(t.note(true, 1_000_000)).toBeNull(); // ON — run in progress
    expect(t.running).toBe(true);
    const run = t.note(false, 1_045_000); // OFF 45 s later
    expect(run).toEqual({ startedAtMs: 1_000_000, seconds: 45 });
    expect(t.running).toBe(false);
  });

  it('ignores OFF with no prior ON', () => {
    const t = new RunoffRunTracker();
    expect(t.note(false, 5_000)).toBeNull();
    expect(t.running).toBe(false);
  });

  it('keeps the first start across repeated ON observations', () => {
    const t = new RunoffRunTracker();
    t.note(true, 10_000);
    t.note(true, 12_000); // still running — start must not advance
    t.note(true, 14_000);
    expect(t.note(false, 20_000)).toEqual({ startedAtMs: 10_000, seconds: 10 });
  });

  it('re-arms for a subsequent run after completing one', () => {
    const t = new RunoffRunTracker();
    t.note(true, 0);
    expect(t.note(false, 30_000)).toEqual({ startedAtMs: 0, seconds: 30 });
    t.note(true, 100_000);
    expect(t.note(false, 160_000)).toEqual({ startedAtMs: 100_000, seconds: 60 });
  });
});
