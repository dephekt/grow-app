import { dev } from '$app/environment';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { env } from '$lib/server/env';
import { buildCommandPublish } from './mqtt/discovery';
import type { CommandRequest, Snapshot } from './mqtt/types';

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type ReadFileLike = (path: string, encoding: BufferEncoding) => Promise<string>;

export interface DevSnapshotConfig {
  enabled: boolean;
  url?: string;
  file?: string;
  commands: 'mock' | 'publish';
}

export interface DevCommandResult {
  status: number;
  body: {
    ok: boolean;
    simulated?: true;
    error?: string;
  };
}

function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Partial<Snapshot>;
  return Array.isArray(raw.devices) && Array.isArray(raw.entities) && Boolean(raw.states) && Boolean(raw.broker);
}

export function devSnapshotConfig(): DevSnapshotConfig {
  const url = env('GROW_DEV_SNAPSHOT_URL');
  const file = env('GROW_DEV_SNAPSHOT_FILE');
  const enabled = dev && Boolean(url || file);
  const commands = env('GROW_DEV_SNAPSHOT_COMMANDS') === 'publish' ? 'publish' : 'mock';
  return { enabled, url, file, commands };
}

export async function loadDevSnapshot(
  config: DevSnapshotConfig = devSnapshotConfig(),
  fetchImpl: FetchLike = globalThis.fetch,
  readFileImpl: ReadFileLike = readFile
): Promise<Snapshot | null> {
  if (!config.enabled) return null;

  try {
    const value = config.url
      ? await fetchSnapshot(config.url, fetchImpl)
      : config.file
        ? await readSnapshot(config.file, readFileImpl)
        : null;

    return isSnapshot(value) ? value : null;
  } catch {
    return null;
  }
}

export async function devSnapshotCommandResult(
  entityId: string,
  request: CommandRequest,
  config: DevSnapshotConfig = devSnapshotConfig(),
  fetchImpl: FetchLike = globalThis.fetch
): Promise<DevCommandResult | null> {
  if (!config.enabled || config.commands === 'publish') return null;

  const snapshot = await loadDevSnapshot(config, fetchImpl);
  if (!snapshot) {
    return {
      status: 503,
      body: { ok: false, error: 'Dev snapshot is unavailable' }
    };
  }

  const entity = snapshot.entities.find((candidate) => candidate.id === entityId);
  if (!entity) {
    return {
      status: 404,
      body: { ok: false, error: 'Unknown entity' }
    };
  }

  try {
    buildCommandPublish(entity, request);
    return {
      status: 200,
      body: { ok: true, simulated: true }
    };
  } catch (error) {
    return {
      status: 400,
      body: { ok: false, error: error instanceof Error ? error.message : 'Command failed' }
    };
  }
}

async function fetchSnapshot(url: string, fetchImpl: FetchLike): Promise<unknown> {
  const response = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
  if (!response.ok) return null;
  return response.json();
}

async function readSnapshot(file: string, readFileImpl: ReadFileLike): Promise<unknown> {
  return JSON.parse(await readFileImpl(resolve(file), 'utf8'));
}
