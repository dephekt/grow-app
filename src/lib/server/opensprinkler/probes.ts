// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { DatabaseSync } from 'node:sqlite';

/** Which zone each substrate probe sits in, and whose pot it is. */

export interface SubstrateProbeRecord {
  /** MQTT node id, e.g. `substrate-a`; the primary key, since a probe is in one pot. */
  nodeId: string;
  zoneId: string | null;
  /** Free text the card, the tabs and the chart legend call it by — "Gelato A". */
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SubstrateProbePatch = Partial<
  Omit<SubstrateProbeRecord, 'nodeId' | 'createdAt' | 'updatedAt'>
>;

interface ProbeRow {
  node_id: string;
  zone_id: string | null;
  name: string | null;
  created_at: string;
  updated_at: string;
}

function toProbe(row: ProbeRow): SubstrateProbeRecord {
  return {
    nodeId: row.node_id,
    zoneId: row.zone_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listProbes(db: DatabaseSync): SubstrateProbeRecord[] {
  const rows = db
    .prepare('SELECT * FROM substrate_probes ORDER BY node_id')
    .all() as unknown as ProbeRow[];
  return rows.map(toProbe);
}

export function getProbe(db: DatabaseSync, nodeId: string): SubstrateProbeRecord | undefined {
  const row = db.prepare('SELECT * FROM substrate_probes WHERE node_id = ?').get(nodeId) as
    ProbeRow | undefined;
  return row ? toProbe(row) : undefined;
}

/** Create or update one probe's binding; only the keys present in `patch` move. */
export function upsertProbe(
  db: DatabaseSync,
  nodeId: string,
  patch: SubstrateProbePatch
): SubstrateProbeRecord {
  const now = new Date().toISOString();
  const existing = getProbe(db, nodeId);

  const merged = {
    zoneId: 'zoneId' in patch ? (patch.zoneId ?? null) : (existing?.zoneId ?? null),
    name: 'name' in patch ? (patch.name ?? null) : (existing?.name ?? null)
  };

  // created_at stays out of the DO UPDATE SET, so the insert's value only lands on a new row.
  db.prepare(
    `INSERT INTO substrate_probes (node_id, zone_id, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(node_id) DO UPDATE SET
       zone_id = excluded.zone_id, name = excluded.name, updated_at = excluded.updated_at`
  ).run(nodeId, merged.zoneId, merged.name, now, now);

  return getProbe(db, nodeId)!;
}

export function deleteProbe(db: DatabaseSync, nodeId: string): boolean {
  const result = db.prepare('DELETE FROM substrate_probes WHERE node_id = ?').run(nodeId);
  return Number(result.changes) > 0;
}
