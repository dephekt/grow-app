import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { secretEnv } from '$lib/server/env';

const touchedKeys: string[] = [];
function setEnv(name: string, value: string | undefined): void {
  touchedKeys.push(name);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const tempDirs: string[] = [];
function writeSecretFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'grow-secret-'));
  tempDirs.push(dir);
  const path = join(dir, 'secret');
  writeFileSync(path, contents);
  return path;
}

afterEach(() => {
  while (touchedKeys.length) delete process.env[touchedKeys.pop()!];
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('secretEnv', () => {
  it('returns a direct NAME value verbatim', () => {
    setEnv('GROW_TEST_SECRET', 'inline-value');
    expect(secretEnv('GROW_TEST_SECRET')).toBe('inline-value');
  });

  it('reads NAME_FILE and strips a single trailing newline', () => {
    setEnv('GROW_TEST_SECRET', undefined);
    setEnv('GROW_TEST_SECRET_FILE', writeSecretFile('from-file\n'));
    expect(secretEnv('GROW_TEST_SECRET')).toBe('from-file');
  });

  it('returns undefined and does NOT call onReadError when neither NAME nor NAME_FILE is set', () => {
    setEnv('GROW_TEST_SECRET', undefined);
    setEnv('GROW_TEST_SECRET_FILE', undefined);
    const onReadError = vi.fn();
    expect(secretEnv('GROW_TEST_SECRET', { optional: true, onReadError })).toBeUndefined();
    expect(onReadError).not.toHaveBeenCalled();
  });

  it('calls onReadError and returns undefined when a set NAME_FILE is unreadable (optional)', () => {
    setEnv('GROW_TEST_SECRET', undefined);
    setEnv('GROW_TEST_SECRET_FILE', '/nonexistent/grow/secret');
    const onReadError = vi.fn();
    expect(secretEnv('GROW_TEST_SECRET', { optional: true, onReadError })).toBeUndefined();
    expect(onReadError).toHaveBeenCalledTimes(1);
  });

  it('throws on an unreadable NAME_FILE when not optional', () => {
    setEnv('GROW_TEST_SECRET', undefined);
    setEnv('GROW_TEST_SECRET_FILE', '/nonexistent/grow/secret');
    expect(() => secretEnv('GROW_TEST_SECRET')).toThrow();
  });
});
