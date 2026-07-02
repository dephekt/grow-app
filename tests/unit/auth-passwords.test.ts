import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '$lib/server/auth/passwords';

describe('password hashing', () => {
  it('round-trips a correct password', () => {
    const stored = hashPassword('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', stored)).toBe(true);
  });

  it('encodes the algorithm and parameters in the stored string', () => {
    const stored = hashPassword('hunter2hunter2');
    expect(stored.startsWith('scrypt$32768$8$1$')).toBe(true);
    expect(stored.split('$')).toHaveLength(6);
  });

  it('produces a distinct salt (and thus hash) each time', () => {
    expect(hashPassword('same-password')).not.toBe(hashPassword('same-password'));
  });

  it('rejects a wrong password', () => {
    const stored = hashPassword('the-right-one');
    expect(verifyPassword('the-wrong-one', stored)).toBe(false);
  });

  it('rejects a tampered hash', () => {
    const stored = hashPassword('tamper-target');
    const tampered = stored.slice(0, -2) + (stored.endsWith('A') ? 'BB' : 'AA');
    expect(verifyPassword('tamper-target', tampered)).toBe(false);
  });

  it('returns false for a null or passwordless account (dummy verify)', () => {
    expect(verifyPassword('anything', null)).toBe(false);
    expect(verifyPassword('anything', undefined)).toBe(false);
  });

  it('returns false for a malformed stored value', () => {
    expect(verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(verifyPassword('x', 'scrypt$oops')).toBe(false);
    expect(verifyPassword('x', 'bcrypt$1$2$3$4$5')).toBe(false);
  });
});
