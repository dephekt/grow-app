// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import {
  BrokerNotConnectedError,
  getSiteMqttService,
  type SiteMqttService
} from '$lib/server/mqtt/service';
import type { SnapshotEvent } from '$lib/server/mqtt/types';
import { getOpenSprinklerConfig, type OpenSprinklerConfig } from './config';
import { buildRunCommand, buildStopCommand } from './commands';
import {
  buildStationDiscovery,
  stationDiscoveryTopic,
  stationEntityId,
  stationSidFromEntityId
} from './discovery';
import { stationStateTopic } from './normalize';
import { getIrrigationDb } from './db';
import { listZones, type Zone } from './zones';

/** Extra seconds past the requested run before the driver-side watchdog force-stops a station. */
const WATCHDOG_GRACE_SECONDS = 10;

/**
 * Report a retained publish that nobody is awaiting.
 *
 * A disconnected broker is not a fault — the client reconnects — so it gets a warning rather
 * than an error with a stack trace. Reporting it as an error is what made an ordinary
 * reconnect window read as a failure, at boot and on any zone edit that landed in one.
 * Anything else is a genuine fault and keeps both its level and its stack.
 *
 * `recovery` is a per-caller sentence rather than a fixed one, because what happens next is
 * the whole question and it is NOT the same everywhere: a skipped discovery publish is
 * reissued for every zone on the next connect, while a skipped retract is simply lost — no
 * later pass clears a retained config for a zone that no longer exists.
 */
function notePublishFailure(what: string, error: unknown, recovery: string): void {
  if (error instanceof BrokerNotConnectedError) {
    console.warn(`[opensprinkler] ${what} skipped: broker not connected — ${recovery}`);
    return;
  }
  console.error(`[opensprinkler] ${what} failed`, error);
}

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
    void this.service.publishOsDiscovery(topic, JSON.stringify(payload)).catch((error: unknown) =>
      // Station-qualified: a reconnect window mid-publishAllDiscovery emits one of these per
      // zone, and undifferentiated lines just read as a repeated line.
      notePublishFailure(
        `discovery publish for station ${zone.stationSid}`,
        error,
        'every zone is republished on the next connect'
      )
    );
  }

  /** Clear a station's retained discovery config AND its normalized state so a later
   *  re-create doesn't seed from stale data. */
  retractStation(sid: number): void {
    this.clearWatchdog(sid);
    const topics = [
      stationDiscoveryTopic(this.config.discoveryPrefix, sid),
      stationStateTopic(this.config.baseTopic, sid)
    ];
    for (const topic of topics) {
      void this.service.publishOsDiscovery(topic, '').catch((error: unknown) =>
        // Topic-qualified: a station retracts two topics, so an unqualified message would
        // print the identical line twice and read as one duplicated warning.
        notePublishFailure(
          `retract of ${topic}`,
          error,
          `station ${sid}'s retained value on it stays until it is retracted again`
        )
      );
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
    const timer = setTimeout(
      () => {
        this.watchdogs.delete(sid);
        // Deliberately NOT notePublishFailure: this is the safety path. A stop that never
        // reached the controller is worth the loud line whatever the cause, and unlike a
        // discovery publish nothing reissues it. (The run still ends on OpenSprinkler's own
        // duration — buildRunCommand sends one — so this is the backstop failing, not the
        // only thing standing between a station and running forever.)
        void this.service
          .publishOsCommand(buildStopCommand(sid))
          .catch((error: unknown) => console.error('[opensprinkler] watchdog stop failed', error));
      },
      (seconds + WATCHDOG_GRACE_SECONDS) * 1000
    );
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
  if (!singleton)
    singleton = new IrrigationController(getSiteMqttService(), getOpenSprinklerConfig());
  return singleton;
}

let driverStarted = false;

/** Initialize the OpenSprinkler driver at server start — web app only, never the read-only recorder. */
export function startOpenSprinklerDriver(): void {
  // Idempotent like startIrrigationScheduler: the subscription below is never unsubscribed,
  // so a second invocation (a dev-HMR re-eval of hooks.server.ts) would stack another
  // listener on the shared emitter — duplicate discovery publishes on every reconnect, and
  // Node's MaxListenersExceededWarning once ten of them pile up.
  if (driverStarted) return;
  const config = getOpenSprinklerConfig();
  if (!config.enabled) return;
  driverStarted = true;

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
  // Covers a start that happens after the broker is already up, where the connect event has
  // fired and will not fire again. That does NOT happen at today's only call site —
  // hooks.server.ts calls getSiteMqttService() (which dials) and this function in one
  // synchronous block, and mqtt.js cannot emit 'connect' synchronously — so treat this as
  // defensive against a future bootstrap order, not as a path in use.
  //
  // The guard is still the load-bearing half. Without it this call publishes into a client
  // that is still dialling, publishRaw rejects, and publishZoneDiscovery reports a skipped
  // publish on every boot for work the subscription above then does correctly. Since
  // notePublishFailure, that report is a warn with no stack rather than an error with one —
  // so what the guard buys is not logging a non-event at all, rather than not logging it
  // alarmingly. Still worth keeping: the quietest line is the one nobody has to read.
  if (service.brokerConnected()) publish();
}
