// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * Registry of open SSE event streams (`GET /api/events`) that admin actions call
 * {@link closeEventStreamsForUser} against to cut a user's live telemetry
 * immediately (process-local by design).
 */
export interface EventStreamHandle {
  /** Owner of the stream; the key we revoke on. */
  userId: number;
  /** Idempotent teardown: safe to call more than once. */
  close: () => void;
}

const active = new Set<EventStreamHandle>();

/** Register an open stream, returning an unregister function the stream must call
 *  from its own teardown. */
export function registerEventStream(handle: EventStreamHandle): () => void {
  active.add(handle);
  return () => {
    active.delete(handle);
  };
}

/** Close and unregister every open stream owned by `userId`, returning the number closed. */
export function closeEventStreamsForUser(userId: number): number {
  let closed = 0;
  for (const handle of [...active]) {
    if (handle.userId !== userId) continue;
    active.delete(handle);
    closed += 1;
    try {
      handle.close();
    } catch (error) {
      // Never let one handle's teardown abort the sweep.
      console.error('[events] failed to close a revoked stream', error);
    }
  }
  return closed;
}

/** Number of currently registered streams. */
export function activeEventStreamCount(): number {
  return active.size;
}
