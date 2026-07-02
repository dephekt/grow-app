import { readFileSync } from 'node:fs';

/** A non-empty environment variable, or undefined. */
export function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

/**
 * A secret read from `NAME`, or from the file at `NAME_FILE` (Docker/compose
 * secret mounts). The trailing newline that `printf`/editors add to secret
 * files is stripped so a mounted secret compares byte-for-byte with an inline
 * value. Returns undefined when neither is set.
 */
export function secretEnv(name: string): string | undefined {
  const direct = env(name);
  if (direct) return direct;

  const file = env(`${name}_FILE`);
  if (!file) return undefined;

  return readFileSync(file, 'utf8').replace(/\r?\n$/, '');
}
