// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/** Whether the SUBSTRATE card and the substrate trends show the coir εσb=0 beside the
 *  committed one; display only, so no band, alert or recorded series moves with it. */

import { PORE_EC_OFFSETS } from '$lib/substrate';

const STORAGE_KEY = 'grow.substrate.compare-pore-ec';

function restore(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Private-mode or blocked storage — the comparison just doesn't survive a reload.
    return false;
  }
}

let enabled = $state(typeof localStorage === 'undefined' ? false : restore());

export const poreEcCompare = {
  get enabled() {
    return enabled;
  },
  /** Named for what the toggle offers rather than the number behind it. */
  get label() {
    return `${PORE_EC_OFFSETS.coir.label} ε₀`;
  },
  get title() {
    const { value, source } = PORE_EC_OFFSETS.coir;
    return `Compare pore EC against the coir-specific εσb=0 of ${value} (${source}) — display only`;
  },
  toggle() {
    enabled = !enabled;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      /* nothing to persist to; the toggle still works for this page */
    }
  }
};
