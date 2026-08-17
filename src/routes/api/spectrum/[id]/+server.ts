// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { getSpectrumDb } from '$lib/server/spectrum/db';
import { getCapture } from '$lib/server/spectrum/captures';

export const GET: RequestHandler = ({ params }) => {
  const capture = params.id ? getCapture(getSpectrumDb(), params.id) : null;
  if (!capture) error(404, 'Capture not found');
  return json({ ok: true, capture });
};
