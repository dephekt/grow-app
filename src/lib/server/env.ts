import { readFileSync } from 'node:fs';

/** A non-empty environment variable, or undefined. */
export function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export interface SecretEnvOptions {
  /** Return undefined instead of throwing when the `NAME_FILE` path can't be
   *  read. For optional subsystems that degrade gracefully (e.g. InfluxDB)
   *  rather than failing loudly on a half-configured secret. */
  optional?: boolean;
}

/**
 * A secret read from `NAME`, or from the file at `NAME_FILE` (Docker/compose
 * secret mounts). The trailing newline that `printf`/editors add to secret
 * files is stripped so a mounted secret compares byte-for-byte with an inline
 * value. Returns undefined when neither is set.
 *
 * A `NAME_FILE` that can't be read throws by default, so a misconfigured secret
 * fails loudly. Pass `{ optional: true }` to swallow the read error and return
 * undefined instead, for subsystems that treat the secret as optional.
 */
export function secretEnv(name: string, options: SecretEnvOptions = {}): string | undefined {
  const direct = env(name);
  if (direct) return direct;

  const file = env(`${name}_FILE`);
  if (!file) return undefined;

  try {
    return readFileSync(file, 'utf8').replace(/\r?\n$/, '');
  } catch (error) {
    if (options.optional) return undefined;
    throw error;
  }
}
