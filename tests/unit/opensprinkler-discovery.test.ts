import { describe, expect, it } from 'vitest';
import { SiteMqttService } from '../../src/lib/server/mqtt/service';
import { buildStationDiscovery, stationEntityId } from '../../src/lib/server/opensprinkler/discovery';
import { matchStationTopic, normalizeStationState, stationStateTopic } from '../../src/lib/server/opensprinkler/normalize';

const BASE = 'grow/daniel-home/os';
const DISCOVERY = 'grow/daniel-home/_discovery';

describe('OpenSprinkler status normalization', () => {
  it('matches a raw station topic but not the normalized /state topic (no republish loop)', () => {
    expect(matchStationTopic(`${BASE}/station/0`, BASE)).toBe(0);
    expect(matchStationTopic(`${BASE}/station/12`, BASE)).toBe(12);
    expect(matchStationTopic(`${BASE}/station/0/state`, BASE)).toBeNull();
    expect(matchStationTopic(`${BASE}/availability`, BASE)).toBeNull();
    expect(matchStationTopic('grow/other/station/0', BASE)).toBeNull();
  });

  it('normalizes OS station JSON to an ON/OFF scalar', () => {
    expect(normalizeStationState('{"state":1,"duration":5}')).toBe('ON');
    expect(normalizeStationState('{"state":0,"duration":5}')).toBe('OFF');
    expect(normalizeStationState('not json')).toBeNull();
    expect(normalizeStationState('{"duration":5}')).toBeNull();
  });

  it('derives the normalized state topic', () => {
    expect(stationStateTopic(BASE, 3)).toBe('grow/daniel-home/os/station/3/state');
  });
});

describe('OpenSprinkler discovery round-trip', () => {
  it('is ingested by the real discovery pipeline as a running binary_sensor', () => {
    const service = new SiteMqttService({
      site: 'daniel-home',
      mqttUrl: 'mqtt://localhost:1883',
      topicPrefix: 'grow/daniel-home',
      discoveryPrefix: DISCOVERY,
      osEnabled: true,
      osBaseTopic: BASE
    });
    const receive = (service as unknown as { handleMessage(topic: string, payload: string): void }).handleMessage.bind(service);

    const { topic, payload } = buildStationDiscovery({ discoveryPrefix: DISCOVERY, baseTopic: BASE, sid: 1, name: 'Tent 1' });
    receive(topic, JSON.stringify(payload));
    receive(`${BASE}/availability`, 'online');
    receive(stationStateTopic(BASE, 1), 'ON');

    const snapshot = service.snapshot();
    const entity = snapshot.entities.find((e) => e.id === stationEntityId(1));
    expect(entity).toBeDefined();
    expect(entity?.component).toBe('binary_sensor');
    expect(entity?.deviceClass).toBe('running');
    expect(entity?.stateTopic).toBe('grow/daniel-home/os/station/1/state');
    expect(snapshot.states[stationEntityId(1)]?.value).toBe('ON');
    const device = snapshot.devices.find((d) => d.id === 'opensprinkler');
    expect(device?.availability).toBe('online');
  });

  it('does not turn a raw OS station JSON topic into an entity (it is normalized instead)', () => {
    const service = new SiteMqttService({
      site: 'daniel-home',
      mqttUrl: 'mqtt://localhost:1883',
      topicPrefix: 'grow/daniel-home',
      discoveryPrefix: DISCOVERY,
      osEnabled: true,
      osBaseTopic: BASE
    });
    const receive = (service as unknown as { handleMessage(topic: string, payload: string): void }).handleMessage.bind(service);

    receive(`${BASE}/station/0`, '{"state":1,"duration":5}');
    expect(service.snapshot().entities).toHaveLength(0);
  });
});
