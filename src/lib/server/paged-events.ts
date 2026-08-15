// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/** Query params for the anchored, offset-paged event feeds. Shared because the anchor is the
 *  subtle part: it holds a reader's pages stable while rows are written underneath them. */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 500;

export interface EventPageParams {
  limit: number;
  offset: number;
  /** Clamped to the current maximum id, so a stale or forged anchor cannot outrun the table. */
  anchorId: number;
}

function clampLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function clampOffset(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function parseAnchorId(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

export function eventPageParams(url: URL, latestId: number): EventPageParams {
  const requested = parseAnchorId(url.searchParams.get('anchorId'));
  return {
    limit: clampLimit(url.searchParams.get('limit')),
    offset: clampOffset(url.searchParams.get('offset')),
    anchorId: requested === null ? latestId : Math.min(requested, latestId)
  };
}
