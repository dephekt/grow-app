// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { getSiteMqttService, type SiteMqttService } from '$lib/server/mqtt/service';
import type { SnapshotEvent } from '$lib/server/mqtt/types';
import { getOpenSprinklerConfig, type OpenSprinklerConfig } from './config';
import { buildRunCommand, buildStopCommand } from './commands';
import { buildStationDiscovery, stationDiscoveryTopic, stationEntityId, stationSidFromEntityId } from './discovery';
import { stationStateTopic } from './normalize';
import { getIrrigationDb } from './db';
import { listZones, type Zone } from './zones';

/** Extra seconds past the requested run before the driver-side watchdog force-stops a station. */
const WATCHDOG_GRACE_SECONDS = 10;

/**
 * The irrigation control seam, translating zone runs into OpenSprinkler MQTT commands —
 * all MQTT I/O goes through the SiteMqttService, the only holder of the mqtt client.
 */
export class IrrigationController {
  private readonly watchdogs = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly service: SiteMqttService,
    private readonly config: OpenSprinklerConfig
  ) {}

  async runStation(sid: number, seconds: number): Promise<void> {
    await this.service.publishOsCommand(buildRunCommand(sid, seconds));
    this.armWatchdog(sid, seconds);
  }

  async stopStation(sid: number): Promise<void> {
    // Publish first so a failed stop leaves the driver-side force-stop armed.
    await this.service.publishOsCommand(buildStopCommand(sid));
    this.clearWatchdog(sid);
  }

  publishAllDiscovery(zones: Zone[]): void {
    for (const zone of zones) this.publishZoneDiscovery(zone);
  }

  publishZoneDiscovery(zone: Zone): void {
    const { topic, payload } = buildStationDiscovery({
      discoveryPrefix: this.config.discoveryPrefix,
      baseTopic: this.config.baseTopic,
      sid: zone.stationSid,
      name: zone.name
    });
    void this.service
      .publishOsDiscovery(topic, JSON.stringify(payload))
      .catch((error) => console.error('[opensprinkler] discovery publish failed', error));
  }

  /** Clear a station's retained discovery config AND its normalized state so a later
   *  re-create doesn't seed from stale data. */
  retractStation(sid: number): void {
    this.clearWatchdog(sid);
    const topics = [stationDiscoveryTopic(this.config.discoveryPrefix, sid), stationStateTopic(this.config.baseTopic, sid)];
    for (const topic of topics) {
      void this.service
        .publishOsDiscovery(topic, '')
        .catch((error) => console.error('[opensprinkler] retract failed', error));
    }
  }

  /** True when our own watchdog is armed OR the live normalized station state reads ON,
   *  so an undiscovered station reads not-running. */
  isStationRunning(sid: number): boolean {
    if (this.watchdogs.has(sid)) return true;
    return this.service.entityState(stationEntityId(sid)).value === 'ON';
  }

  /** React to a station's normalized state, clearing the watchdog on OFF so it can't
   *  clip a run started externally during the grace window. */
  noteStationState(sid: number, running: boolean): void {
    if (!running) this.clearWatchdog(sid);
  }

  private armWatchdog(sid: number, seconds: number): void {
    this.clearWatchdog(sid);
    const timer = setTimeout(() => {
      this.watchdogs.delete(sid);
      void this.service
        .publishOsCommand(buildStopCommand(sid))
        .catch((error) => console.error('[opensprinkler] watchdog stop failed', error));
    }, (seconds + WATCHDOG_GRACE_SECONDS) * 1000);
    timer.unref?.();
    this.watchdogs.set(sid, timer);
  }

  private clearWatchdog(sid: number): void {
    const timer = this.watchdogs.get(sid);
    if (timer) {
      clearTimeout(timer);
      this.watchdogs.delete(sid);
    }
  }
}

let singleton: IrrigationController | null = null;

export function getIrrigationController(): IrrigationController {
  if (!singleton) singleton = new IrrigationController(getSiteMqttService(), getOpenSprinklerConfig());
  return singleton;
}

/** Initialize the OpenSprinkler driver at server start — web app only, never the read-only recorder. */
export function startOpenSprinklerDriver(): void {
  const config = getOpenSprinklerConfig();
  if (!config.enabled) return;

  const service = getSiteMqttService();
  const controller = getIrrigationController();
  // Guarded so a transient DB error can't throw into the EventEmitter dispatch path.
  const publish = () => {
    try {
      controller.publishAllDiscovery(listZones(getIrrigationDb()));
    } catch (error) {
      console.error('[opensprinkler] publishing station discovery failed', error);
    }
  };

  service.subscribe((event: SnapshotEvent) => {
    if (event.type === 'broker' && event.broker?.connected) publish();
    if (event.type === 'state' && event.entityId && event.state) {
      const sid = stationSidFromEntityId(event.entityId);
      if (sid !== null) controller.noteStationState(sid, event.state.value === 'ON');
    }
  });
  // Only when the broker is already up: this covers the case where it connected before we
  // subscribed, so the event above has already fired and will not fire again. At an ordinary
  // cold start it has not, and publishing into a client that is still dialling rejects —
  // which publishZoneDiscovery reports as a failure, on a boot where nothing is wrong.
  if (service.brokerConnected()) publish();
}
