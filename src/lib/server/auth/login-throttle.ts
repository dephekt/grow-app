import {
  getLoginMaxInflight,
  getLoginRateMax,
  getLoginRateWindowSeconds
} from '$lib/server/auth/config';

/**
 * Login-path throttle: a per-IP fixed-window rate limiter plus a global cap on
 * concurrent scrypt derivations. Both defend the public `POST /auth/login` path,
 * where every attempt (even for an unknown/passwordless user) burns a full
 * scrypt. The async move in passwords.ts already stops a login flood from
 * blocking the event loop; these caps stop it from monopolising the libuv
 * threadpool and add a brute-force throttle. See #34.
 *
 * In-memory and per-process — fine because the app is a single adapter-node
 * instance with module-level singletons (auth DB, MQTT service). A multi-instance
 * deployment would need a shared store instead.
 */

export interface RateDecision {
  allowed: boolean;
  /** Seconds until the caller's window resets — surface as a `Retry-After`
   *  header. 0 when allowed. */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export interface LoginThrottleOptions {
  /** Max attempts per IP per window; <= 0 disables per-IP limiting. */
  max: number;
  /** Fixed window length in seconds (clamped to >= 1). */
  windowSeconds: number;
  /** Max concurrent derivations; <= 0 disables the in-flight cap. */
  maxInflight: number;
}

export interface LoginThrottle {
  /** Record an attempt from `ip` and decide whether it may proceed. Counts every
   *  call so a sustained flood stays blocked for the rest of its window. `now` is
   *  injectable for deterministic tests. */
  checkRate(ip: string, now?: number): RateDecision;
  /** Try to reserve a derivation slot; false when the in-flight cap is reached.
   *  A true result MUST be paired with a `releaseSlot()` in a finally block. */
  tryAcquireSlot(): boolean;
  releaseSlot(): void;
  /** Drop buckets whose window has elapsed so the map can't grow unbounded. */
  sweep(now?: number): void;
  /** Current in-flight derivation count (for tests/introspection). */
  readonly inFlight: number;
  /** Number of per-IP buckets currently held (for tests/introspection). Lets a
   *  sweep test observe map reclamation, which a checkRate-only assertion can't
   *  distinguish from checkRate's own lazy per-bucket reset. */
  readonly trackedIps: number;
}

export function createLoginThrottle(options: LoginThrottleOptions): LoginThrottle {
  const buckets = new Map<string, Bucket>();
  const windowMs = Math.max(1, options.windowSeconds) * 1000;
  let inFlight = 0;

  return {
    checkRate(ip: string, now: number = Date.now()): RateDecision {
      if (options.max <= 0) return { allowed: true, retryAfterSeconds: 0 };

      let bucket = buckets.get(ip);
      if (!bucket || now >= bucket.resetAt) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(ip, bucket);
      }
      bucket.count += 1;

      if (bucket.count > options.max) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },

    tryAcquireSlot(): boolean {
      if (options.maxInflight <= 0) return true;
      if (inFlight >= options.maxInflight) return false;
      inFlight += 1;
      return true;
    },

    releaseSlot(): void {
      if (inFlight > 0) inFlight -= 1;
    },

    sweep(now: number = Date.now()): void {
      for (const [ip, bucket] of buckets) {
        if (now >= bucket.resetAt) buckets.delete(ip);
      }
    },

    get inFlight(): number {
      return inFlight;
    },

    get trackedIps(): number {
      return buckets.size;
    }
  };
}

let singleton: LoginThrottle | null = null;

/** Process-wide login throttle, built once from config. A 10-minute unref'd timer
 *  sweeps stale IP buckets so the map stays bounded without holding the process
 *  open (mirrors the auth-DB maintenance timer in db.ts). */
export function getLoginThrottle(): LoginThrottle {
  if (singleton) return singleton;
  singleton = createLoginThrottle({
    max: getLoginRateMax(),
    windowSeconds: getLoginRateWindowSeconds(),
    maxInflight: getLoginMaxInflight()
  });

  const sweeper = setInterval(() => singleton!.sweep(), 10 * 60 * 1000);
  sweeper.unref?.();

  return singleton;
}
