// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { PageLoadEvent } from './$types';

export const ssr = false;

export const load = ({ url }: PageLoadEvent) => {
  return {
    selectedDeviceId: url.searchParams.get('device'),
    selectedSectionId: url.searchParams.get('section')
  };
};
