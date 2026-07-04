/**
 * Registry of open SSE event streams (`GET /api/events`).
 *
 * The stream authorizes once at connect time and then runs indefinitely, so an
 * admin disabling a user or revoking their sessions has no way to cut off the
 * live telemetry they already have flowing. This registry is the immediate lever:
 * the events route hands us a transport-agnostic `close` callback tagged with the
 * owning user, and admin actions call {@link closeEventStreamsForUser} to tear the
 * matching streams down now — rather than waiting for the stream's own periodic
 * session re-validation (the slower backstop) or for the connection to happen to
 * drop.
 *
 * Process-local by design: a server restart already clears every stream, so this
 * only needs to close the interactive window while the process keeps running.
 */
export interface EventStreamHandle {
  /** Owner of the stream; the key we revoke on. */
  userId: number;
  /** Idempotent teardown: clears the stream's timers, unsubscribes, and closes
   *  the underlying controller. Safe to call more than once. */
  close: () => void;
}

const active = new Set<EventStreamHandle>();

/** Register an open stream. Returns an unregister function the stream must call
 *  from its own teardown so a normal client disconnect leaves nothing behind. */
export function registerEventStream(handle: EventStreamHandle): () => void {
  active.add(handle);
  return () => {
    active.delete(handle);
  };
}

/**
 * Close and unregister every open stream owned by `userId`. Returns the number of
 * streams closed. Iterates a snapshot and removes each handle before invoking its
 * `close`, so the stream's own unregister (fired from `close`) is a harmless
 * no-op and re-entrancy can't skip or double-visit a handle.
 */
export function closeEventStreamsForUser(userId: number): number {
  let closed = 0;
  for (const handle of [...active]) {
    if (handle.userId !== userId) continue;
    active.delete(handle);
    closed += 1;
    handle.close();
  }
  return closed;
}

/** Number of currently registered streams. Exposed for tests/introspection. */
export function activeEventStreamCount(): number {
  return active.size;
}
