import { getSiteMqttService, type SiteMqttService } from '$lib/server/mqtt/service';
import type { SnapshotEvent } from '$lib/server/mqtt/types';
import { getOpenSprinklerConfig, type OpenSprinklerConfig } from './config';
import { buildRunCommand, buildStopCommand } from './commands';
import { buildStationDiscovery, stationDiscoveryTopic, stationSidFromEntityId } from './discovery';
import { stationStateTopic } from './normalize';
import { getIrrigationDb } from './db';
import { listZones, type Zone } from './zones';

/** Extra seconds past the requested run before the driver-side watchdog force-stops
 *  a station. OS enforces its own `t` timer, so this is a belt-and-suspenders cap. */
const WATCHDOG_GRACE_SECONDS = 10;

/**
 * The irrigation control seam. Translates zone runs into OpenSprinkler MQTT commands
 * and manages self-published station discovery. All MQTT I/O goes through the
 * SiteMqttService (the only holder of the mqtt client).
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
    // Publish first, then drop the watchdog: if the stop publish fails (e.g. broker
    // disconnected), the driver-side force-stop must stay armed as the safety net on
    // exactly the failure path where a still-running valve most needs it.
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

  /** Clear a station's retained discovery config AND its normalized state (both
   *  empty retained payloads) so a later re-create doesn't seed from stale data.
   *  The in-memory entity lingers until the next app restart — acceptable for v1. */
  retractStation(sid: number): void {
    this.clearWatchdog(sid);
    const topics = [stationDiscoveryTopic(this.config.discoveryPrefix, sid), stationStateTopic(this.config.baseTopic, sid)];
    for (const topic of topics) {
      void this.service
        .publishOsDiscovery(topic, '')
        .catch((error) => console.error('[opensprinkler] retract failed', error));
    }
  }

  /** React to a station's normalized state. On OFF the run is done, so clear the
   *  watchdog — this both avoids the redundant stop and prevents a stale watchdog
   *  from clipping a run started externally (OS web UI) during the grace window. */
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

/**
 * Initialize the OpenSprinkler driver at server start (web app only — never the
 * read-only recorder). No-op when the site isn't OS-enabled. (Re)publishes station
 * discovery on every broker connect so retained configs survive reconnects.
 */
export function startOpenSprinklerDriver(): void {
  const config = getOpenSprinklerConfig();
  if (!config.enabled) return;

  const service = getSiteMqttService();
  const controller = getIrrigationController();
  // Guarded so a transient DB error (listZones) can't throw into the EventEmitter
  // path — this runs inside broker-event dispatch and at startup.
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
  // Best-effort immediate publish; a no-op reject if the broker isn't connected yet
  // (the broker-connect event above will then do the real publish).
  publish();
}
