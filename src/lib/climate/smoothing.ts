// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/** Time-windowed rolling median: a median because one bad SHT45 sample must not tip a band
 *  edge, time-windowed so a publisher that goes quiet ages out instead of pinning a value. */
export class RollingMedian {
  private samples: Array<{ atMs: number; value: number }> = [];

  constructor(private readonly windowMs: number) {}

  /** Drops anything outside the window; future-dated samples go too, so a backwards clock
   *  cannot strand them. */
  private prune(nowMs: number): void {
    const cutoff = nowMs - this.windowMs;
    this.samples = this.samples.filter((s) => s.atMs >= cutoff && s.atMs <= nowMs);
  }

  push(value: number, nowMs: number): void {
    this.samples.push({ atMs: nowMs, value });
    this.prune(nowMs);
  }

  /** The median over the window as of `nowMs`, or null once nothing recent remains. Prunes on
   *  read as well as write, so a caller that only reads cannot be served an unbounded-age value
   *  when the writing loop has stopped ticking. */
  value(nowMs: number): number | null {
    this.prune(nowMs);
    if (this.samples.length === 0) return null;
    const sorted = this.samples.map((s) => s.value).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  /** Drop everything, so a stale window cannot outlive the input that filled it. */
  reset(): void {
    this.samples = [];
  }

  get size(): number {
    return this.samples.length;
  }
}
