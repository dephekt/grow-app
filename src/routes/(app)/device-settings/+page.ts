// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

export const ssr = false;

export const load = ({ url }: { url: URL }) => {
  return {
    selectedDeviceId: url.searchParams.get('device'),
    selectedSectionId: url.searchParams.get('section')
  };
};
