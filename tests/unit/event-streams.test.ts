import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activeEventStreamCount,
  closeEventStreamsForUser,
  registerEventStream
} from '$lib/server/events/streams';

// The registry is a process-local singleton, so clear it between tests by
// revoking the users each test touches. Every test below registers under user
// ids 1–3 exclusively.
afterEach(() => {
  for (const id of [1, 2, 3]) closeEventStreamsForUser(id);
});

describe('event stream registry', () => {
  it('registers and unregisters a stream', () => {
    expect(activeEventStreamCount()).toBe(0);
    const unregister = registerEventStream({ userId: 1, close: () => {} });
    expect(activeEventStreamCount()).toBe(1);
    unregister();
    expect(activeEventStreamCount()).toBe(0);
  });

  it('closes every stream for the target user and returns the count', () => {
    const a = vi.fn();
    const b = vi.fn();
    registerEventStream({ userId: 1, close: a });
    registerEventStream({ userId: 1, close: b });

    expect(closeEventStreamsForUser(1)).toBe(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(activeEventStreamCount()).toBe(0);
  });

  it('leaves other users’ streams untouched', () => {
    const mine = vi.fn();
    const theirs = vi.fn();
    registerEventStream({ userId: 1, close: mine });
    registerEventStream({ userId: 2, close: theirs });

    expect(closeEventStreamsForUser(1)).toBe(1);
    expect(mine).toHaveBeenCalledTimes(1);
    expect(theirs).not.toHaveBeenCalled();
    expect(activeEventStreamCount()).toBe(1);
  });

  it('returns 0 when the user has no open streams', () => {
    registerEventStream({ userId: 1, close: () => {} });
    expect(closeEventStreamsForUser(3)).toBe(0);
    expect(activeEventStreamCount()).toBe(1);
  });

  it('tolerates a close callback that unregisters the same handle (no double-visit)', () => {
    // Mirrors the real stream: its `close` runs the stream's own teardown, which
    // calls the unregister returned by registerEventStream. closeEventStreamsForUser
    // must have already removed the handle so this is a harmless no-op.
    let unregister = () => {};
    const close = vi.fn(() => unregister());
    unregister = registerEventStream({ userId: 1, close });

    expect(closeEventStreamsForUser(1)).toBe(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(activeEventStreamCount()).toBe(0);
  });
});
