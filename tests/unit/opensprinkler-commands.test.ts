import { describe, expect, it } from 'vitest';
import { buildRunCommand, buildStopCommand } from '../../src/lib/server/opensprinkler/commands';

describe('OpenSprinkler command strings', () => {
  it('builds a manual station run command (no pw — Ignore Password)', () => {
    expect(buildRunCommand(0, 5)).toBe('cm?sid=0&t=5&en=1');
    expect(buildRunCommand(3, 120)).toBe('cm?sid=3&t=120&en=1');
  });

  it('builds a single-station stop command', () => {
    expect(buildStopCommand(0)).toBe('cm?sid=0&en=0');
    expect(buildStopCommand(2)).toBe('cm?sid=2&en=0');
  });
});
