import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '$lib/server/auth/passwords';

describe('password hashing', () => {
  it('round-trips a correct password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
  });

  it('encodes the algorithm and parameters in the stored string', async () => {
    const stored = await hashPassword('hunter2hunter2');
    expect(stored.startsWith('scrypt$32768$8$1$')).toBe(true);
    expect(stored.split('$')).toHaveLength(6);
  });

  it('produces a distinct salt (and thus hash) each time', async () => {
    expect(await hashPassword('same-password')).not.toBe(await hashPassword('same-password'));
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('the-right-one');
    expect(await verifyPassword('the-wrong-one', stored)).toBe(false);
  });

  it('rejects a tampered hash', async () => {
    const stored = await hashPassword('tamper-target');
    const tampered = stored.slice(0, -2) + (stored.endsWith('A') ? 'BB' : 'AA');
    expect(await verifyPassword('tamper-target', tampered)).toBe(false);
  });

  it('returns false for a null or passwordless account (dummy verify)', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(await verifyPassword('anything', undefined)).toBe(false);
  });

  it('returns false for a malformed stored value', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$oops')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$1$2$3$4$5')).toBe(false);
  });
});
