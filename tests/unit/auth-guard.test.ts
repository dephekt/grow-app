import { describe, expect, it } from 'vitest';
import { classifyPath, isApiOrAuthPath, isCsrfSafe, isSafeMethod } from '$lib/server/auth/guard';

describe('classifyPath', () => {
  it('treats health, favicon, login, /api/me and pre-session auth routes as public', () => {
    for (const p of ['/health', '/favicon.ico', '/login', '/api/me', '/auth/login', '/auth/oidc', '/auth/oidc/callback']) {
      expect(classifyPath(p)).toBe('public');
    }
  });

  it('treats logout and password change as protected (need a session)', () => {
    expect(classifyPath('/auth/logout')).toBe('protected');
    expect(classifyPath('/auth/password')).toBe('protected');
  });

  it('treats firmware device manifest and binary paths as device-token', () => {
    expect(classifyPath('/api/firmware/devices/atlas-hydro-monitor/manifest')).toBe('device-token');
    expect(classifyPath('/api/firmware/devices/atlas-hydro-monitor/binary/atlas.ota.bin')).toBe('device-token');
  });

  it('treats other firmware endpoints and app/api paths as protected', () => {
    for (const p of [
      '/',
      '/device-settings',
      '/settings/users',
      '/api/snapshot',
      '/api/events',
      '/api/firmware/devices/atlas/apply',
      '/api/firmware/devices/atlas/check'
    ]) {
      expect(classifyPath(p)).toBe('protected');
    }
  });
});

describe('isSafeMethod', () => {
  it('is true for read methods and false for writes', () => {
    expect(isSafeMethod('GET')).toBe(true);
    expect(isSafeMethod('HEAD')).toBe(true);
    expect(isSafeMethod('OPTIONS')).toBe(true);
    expect(isSafeMethod('POST')).toBe(false);
    expect(isSafeMethod('PATCH')).toBe(false);
    expect(isSafeMethod('DELETE')).toBe(false);
  });
});

describe('isApiOrAuthPath', () => {
  it('matches /api and /auth prefixes only', () => {
    expect(isApiOrAuthPath('/api/users')).toBe(true);
    expect(isApiOrAuthPath('/auth/login')).toBe(true);
    expect(isApiOrAuthPath('/settings/users')).toBe(false);
    expect(isApiOrAuthPath('/')).toBe(false);
  });
});

describe('isCsrfSafe', () => {
  it('requires a JSON content-type', () => {
    expect(isCsrfSafe('application/json', null)).toBe(true);
    expect(isCsrfSafe('application/json; charset=utf-8', 'same-origin')).toBe(true);
    expect(isCsrfSafe('application/x-www-form-urlencoded', null)).toBe(false);
    expect(isCsrfSafe(null, null)).toBe(false);
  });

  it('rejects cross-site requests but allows same-origin/none/missing', () => {
    expect(isCsrfSafe('application/json', 'cross-site')).toBe(false);
    expect(isCsrfSafe('application/json', 'same-origin')).toBe(true);
    expect(isCsrfSafe('application/json', 'none')).toBe(true);
    expect(isCsrfSafe('application/json', null)).toBe(true);
  });
});
