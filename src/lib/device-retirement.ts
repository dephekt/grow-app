// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/** Publisher nodes intentionally retired from this site's app, even if retained MQTT data remains. */
const RETIRED_DEVICE_NODE_IDS: ReadonlySet<string> = new Set(['m5stack-airq']);

export function isRetiredDeviceNode(nodeId: string | null | undefined): boolean {
  return nodeId != null && RETIRED_DEVICE_NODE_IDS.has(nodeId);
}
