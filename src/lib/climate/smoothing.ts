// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * Time-windowed rolling median of the control input.
 *
 * A median rather than a mean because the failure it guards against is a single bad sample
 * from the SHT45 tipping the band edge, and a mean lets one outlier drag the result. The
 * window is time-based, not sample-count based, so a publisher that goes quiet ages out of
 * the window instead of pinning a stale value in it.
 */
export class RollingMedian {
  private samples: Array<{ atMs: number; value: number }> = [];

  constructor(private readonly windowMs: number) {}

  push(value: number, nowMs: number): void {
    this.samples.push({ atMs: nowMs, value });
    const cutoff = nowMs - this.windowMs;
    // A clock that jumped backwards would otherwise strand future-dated samples forever.
    this.samples = this.samples.filter((s) => s.atMs >= cutoff && s.atMs <= nowMs);
  }

  /** The median over the window, or null before any sample has landed. */
  value(): number | null {
    if (this.samples.length === 0) return null;
    const sorted = this.samples.map((s) => s.value).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  /** Drop everything — used when the input goes null, so a stale window cannot outlive it. */
  reset(): void {
    this.samples = [];
  }

  get size(): number {
    return this.samples.length;
  }
}
