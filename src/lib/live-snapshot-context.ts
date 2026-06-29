import { getContext, setContext } from 'svelte';
import type { createLiveSnapshot } from './live-snapshot.svelte';

export type LiveSnapshot = ReturnType<typeof createLiveSnapshot>;

const KEY = Symbol('live-snapshot');

/** Provide the single shared live snapshot (one SSE connection) from the layout. */
export function setLiveSnapshotContext(value: LiveSnapshot): LiveSnapshot {
  setContext(KEY, value);
  return value;
}

/** Read the shared live snapshot from any descendant page/component. */
export function getLiveSnapshot(): LiveSnapshot {
  return getContext<LiveSnapshot>(KEY);
}
