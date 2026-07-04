import { describe, expect, it } from 'vitest';
import { createLoginThrottle } from '$lib/server/auth/login-throttle';

describe('login throttle — per-IP rate limit', () => {
  it('allows up to max attempts per window then blocks', () => {
    const t = createLoginThrottle({ max: 3, windowSeconds: 60, maxInflight: 0 });
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(t.checkRate('1.2.3.4', now).allowed).toBe(true);
    }
    const blocked = t.checkRate('1.2.3.4', now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it('reports a retry-after that shrinks as the window elapses', () => {
    const t = createLoginThrottle({ max: 1, windowSeconds: 60, maxInflight: 0 });
    const start = 5_000_000;
    expect(t.checkRate('ip', start).allowed).toBe(true);
    // 30s into the window, ~30s remain until reset.
    expect(t.checkRate('ip', start + 30_000).retryAfterSeconds).toBe(30);
    // Retry-After is never below 1 even at the very edge of the window.
    expect(t.checkRate('ip', start + 59_999).retryAfterSeconds).toBe(1);
  });

  it('resets to a fresh allowance once the window passes', () => {
    const t = createLoginThrottle({ max: 2, windowSeconds: 60, maxInflight: 0 });
    const start = 0;
    t.checkRate('ip', start);
    t.checkRate('ip', start);
    expect(t.checkRate('ip', start).allowed).toBe(false);
    // At/after resetAt a new window opens.
    expect(t.checkRate('ip', start + 60_000).allowed).toBe(true);
  });

  it('tracks each IP independently', () => {
    const t = createLoginThrottle({ max: 1, windowSeconds: 60, maxInflight: 0 });
    const now = 42;
    expect(t.checkRate('a', now).allowed).toBe(true);
    expect(t.checkRate('a', now).allowed).toBe(false);
    // A different IP is unaffected by a's exhausted bucket.
    expect(t.checkRate('b', now).allowed).toBe(true);
  });

  it('disables per-IP limiting when max <= 0', () => {
    const t = createLoginThrottle({ max: 0, windowSeconds: 60, maxInflight: 0 });
    for (let i = 0; i < 100; i++) {
      expect(t.checkRate('flooder', 1).allowed).toBe(true);
    }
  });

  it('drops elapsed buckets on sweep', () => {
    const t = createLoginThrottle({ max: 1, windowSeconds: 60, maxInflight: 0 });
    t.checkRate('ip', 0);
    expect(t.trackedIps).toBe(1);
    // A sweep inside the window keeps the live bucket.
    t.sweep(30_000);
    expect(t.trackedIps).toBe(1);
    // After the window the bucket is actually reclaimed — the map shrinks, which a
    // checkRate assertion can't distinguish from checkRate's own lazy reset (so a
    // no-op sweep would slip past that). The next attempt still starts fresh.
    t.sweep(60_000);
    expect(t.trackedIps).toBe(0);
    expect(t.checkRate('ip', 60_000).allowed).toBe(true);
  });
});

describe('login throttle — in-flight derivation cap', () => {
  it('grants slots up to the cap then refuses until released', () => {
    const t = createLoginThrottle({ max: 0, windowSeconds: 60, maxInflight: 2 });
    expect(t.tryAcquireSlot()).toBe(true);
    expect(t.tryAcquireSlot()).toBe(true);
    expect(t.inFlight).toBe(2);
    expect(t.tryAcquireSlot()).toBe(false);

    t.releaseSlot();
    expect(t.inFlight).toBe(1);
    expect(t.tryAcquireSlot()).toBe(true);
  });

  it('never lets inFlight go negative on an unbalanced release', () => {
    const t = createLoginThrottle({ max: 0, windowSeconds: 60, maxInflight: 2 });
    t.releaseSlot();
    expect(t.inFlight).toBe(0);
  });

  it('disables the cap when maxInflight <= 0', () => {
    const t = createLoginThrottle({ max: 0, windowSeconds: 60, maxInflight: 0 });
    for (let i = 0; i < 100; i++) {
      expect(t.tryAcquireSlot()).toBe(true);
    }
    expect(t.inFlight).toBe(0);
  });
});
