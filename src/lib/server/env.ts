// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { readFileSync } from 'node:fs';

/** A non-empty environment variable, or undefined. */
export function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

/** A non-negative integer from `name`, or `fallback` when unset/invalid. */
export function intEnv(name: string, fallback: number): number {
  const raw = env(name)?.trim();
  // Empty-after-trim falls back rather than parsing — Number('  ') is 0.
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export interface SecretEnvOptions {
  /** Return undefined instead of throwing when the `NAME_FILE` path can't be read. */
  optional?: boolean;
  /** Invoked with the read error when `optional` swallows a `NAME_FILE` read failure. */
  onReadError?: (error: unknown) => void;
}

/**
 * A secret read from `NAME`, or from the file at `NAME_FILE` (Docker/compose
 * secret mounts), with its trailing newline stripped.
 */
export function secretEnv(name: string, options: SecretEnvOptions = {}): string | undefined {
  const direct = env(name);
  if (direct) return direct;

  const file = env(`${name}_FILE`);
  if (!file) return undefined;

  try {
    return readFileSync(file, 'utf8').replace(/\r?\n$/, '');
  } catch (error) {
    if (options.optional) {
      options.onReadError?.(error);
      return undefined;
    }
    throw error;
  }
}
