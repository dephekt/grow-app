// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/** Time-windowed rolling median: a median so one bad sample cannot tip a band edge, windowed
 *  so a publisher that goes quiet ages out instead of pinning a value. */
export class RollingMedian {
  private samples: Array<{ atMs: number; value: number }> = [];

  constructor(private readonly windowMs: number) {}

  private inWindow(nowMs: number): number[] {
    const cutoff = nowMs - this.windowMs;
    // Future-dated samples go too, so a backwards clock cannot strand them.
    return this.samples.filter((s) => s.atMs >= cutoff && s.atMs <= nowMs).map((s) => s.value);
  }

  push(value: number, nowMs: number): void {
    this.samples.push({ atMs: nowMs, value });
    const cutoff = nowMs - this.windowMs;
    this.samples = this.samples.filter((s) => s.atMs >= cutoff && s.atMs <= nowMs);
  }

  /** The median as of `nowMs`, or null once nothing recent remains. Windowed on read as well as
   *  write so a caller that only reads is never served a stale value, but deliberately does NOT
   *  mutate — /api/climate reads this shared singleton on every request. */
  value(nowMs: number): number | null {
    const sorted = this.inWindow(nowMs).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  /** How many samples fall in the window as of `nowMs`. */
  count(nowMs: number): number {
    return this.inWindow(nowMs).length;
  }

  /** Drop everything, so a stale window cannot outlive the input that filled it. */
  reset(): void {
    this.samples = [];
  }

  get size(): number {
    return this.samples.length;
  }
}
