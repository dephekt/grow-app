import { describe, expect, it } from 'vitest';
import { IrrigationController } from '../../src/lib/server/opensprinkler/controller';
import { stationEntityId } from '../../src/lib/server/opensprinkler/discovery';
import type { SiteMqttService } from '../../src/lib/server/mqtt/service';
import type { OpenSprinklerConfig } from '../../src/lib/server/opensprinkler/config';
import type { EntityState } from '../../src/lib/server/mqtt/types';

const config: OpenSprinklerConfig = { enabled: true, baseTopic: 'grow/test/os', discoveryPrefix: 'homeassistant' };

// A minimal SiteMqttService stub: enough for runStation (publish) + isStationRunning
// (entityState). entityState mirrors the real one's null-guard for a missing entity.
function makeController(states: Record<string, EntityState> = {}) {
  const service = {
    publishOsCommand: async () => {},
    entityState: (id: string): EntityState => states[id] ?? { value: null, updatedAt: null }
  } as unknown as SiteMqttService;
  return new IrrigationController(service, config);
}

describe('IrrigationController.isStationRunning', () => {
  it('is true while our own watchdog is armed (we just started a run)', async () => {
    const controller = makeController();
    await controller.runStation(2, 30); // arms the watchdog
    expect(controller.isStationRunning(2)).toBe(true);
    controller.noteStationState(2, false); // clear the armed watchdog timer
  });

  it("is true when the live entity state reads 'ON'", () => {
    const controller = makeController({ [stationEntityId(3)]: { value: 'ON', updatedAt: null } });
    expect(controller.isStationRunning(3)).toBe(true);
  });

  it('is false for an undiscovered station (entityState value null)', () => {
    const controller = makeController();
    expect(controller.isStationRunning(5)).toBe(false);
  });
});
