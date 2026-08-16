// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/** Read a route handler's JSON body at a declared type. `Response.json()` returns `any`, so this
 *  is the one sanctioned assertion for it in the suite -- #151's validator swaps in here. */
export async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
