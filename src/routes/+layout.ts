// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

// One client-rendered shell for the whole app. The authenticated shell (snapshot
// load + live SSE session) lives in the (app) route group; the (auth) group holds
// the public login page. ssr=false is inherited by both.
export const ssr = false;
