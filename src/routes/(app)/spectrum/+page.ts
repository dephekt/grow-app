// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { redirect } from '@sveltejs/kit';

// The spectrum view was merged into the Lights page. Keep old links / bookmarks working.
// 307 (temporary) so it isn't cached hard, in case the route is ever reinstated.
export const load = () => {
  redirect(307, '/lights');
};
