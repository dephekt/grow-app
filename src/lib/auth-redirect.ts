// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * Only allow same-site absolute paths as a post-login redirect target, rejecting
 * protocol-relative (`//host`), its backslash variant (`/\host` / `/%5Chost`), and the
 * tab/newline the WHATWG URL parser strips while resolving (`?next=/%09/host` → `//host`).
 *
 * Must stay free of server-only imports — the universal login `load` imports it too.
 */
export function sanitizeNext(raw: string | null): string {
  if (!raw) return '/';
  const path = raw.replace(/[\t\n\r]/g, '');
  if (path[0] !== '/' || path[1] === '/' || path[1] === '\\') return '/';
  return path;
}
