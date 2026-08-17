// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/** The grow's light plan and the one config to edit per grow; targets are center-canopy. */

export type StageKey = 'seedling' | 'veg' | 'flower' | 'ripen';

export interface GrowStage {
  key: StageKey;
  label: string;
  /** Hours the light is ON per day. */
  onHours: number;
  /** Hours dark per day (onHours + offHours = 24). */
  offHours: number;
}

export const STAGES: Record<StageKey, GrowStage> = {
  seedling: { key: 'seedling', label: 'Seedling', onHours: 18, offHours: 6 },
  veg: { key: 'veg', label: 'Veg', onHours: 18, offHours: 6 },
  flower: { key: 'flower', label: 'Flower', onHours: 12, offHours: 12 },
  ripen: { key: 'ripen', label: 'Ripen', onHours: 12, offHours: 12 }
};

export interface RampStep {
  /** Days since GROW_START (0-based; day 0 = planting) this step takes effect. */
  fromDay: number;
  /** Center-canopy PPFD target from this day, µmol·m⁻²·s⁻¹. */
  ppfd: number;
}

/** The book's temperature/RH pair for one half of the photoperiod — reference context only.
 *  Neither is a control target: there is no heater and no chiller, so most of the range is
 *  unreachable here. Only `airVpdTarget` is regulated. */
export interface ClimateReference {
  tempC: number;
  rhPct: number;
}

export interface GrowWeek {
  /** 1-based overall grow week. */
  week: number;
  stage: StageKey;
  /** Center-canopy PPFD target, µmol·m⁻²·s⁻¹. For a week with a `ramp`, this is the week's ceiling
   *  (what the weekly chart plots); the live target follows the day-stepped ramp. */
  ppfdTarget: number;
  /** Optional within-week day-stepped ramp (e.g. the seedling week climbs off the dome). */
  ramp?: RampStep[];
  /** ROOM (air) VPD target in kPa — the one climate value the control loop regulates. One figure
   *  covers the whole 24 h: the book holds VPD constant and lets RH fall with the night
   *  temperature, rather than depressing VPD after dark. */
  airVpdTarget: number;
  /** The temp/RH the book pairs with that VPD, lights-on and lights-off. Displayed, never enforced. */
  climateRef: { day: ClimateReference; night: ClimateReference };
}

/**
 * Schedule for the current grow (Gelato 41 BX F2 · Double Down Mule #1, clones, CO₂). The first
 * week after transplant was rooting-in time; named veg starts after that week is complete.
 *
 * Climate columns are the CCI Black Book p.57 "LED 8 Week Crop Steering Guidelines" tracker —
 * 2 veg weeks + 8 flower weeks, which is a 1:1 match for this plan's ten. °F converted to °C.
 * PPFD stays as measured for this fixture rather than the book's range.
 */
/** The book's four climate blocks, named once so correcting a figure is one edit rather than
 *  five sibling literals with nothing to catch a missed one. */
const EARLY = { day: { tempC: 28.9, rhPct: 75 }, night: { tempC: 28.9, rhPct: 75 } } as const;
const BULKING = { day: { tempC: 27.8, rhPct: 70 }, night: { tempC: 21.1, rhPct: 55 } } as const;
const FADE_EARLY = { day: { tempC: 24.4, rhPct: 62 }, night: { tempC: 18.3, rhPct: 55 } } as const;
const FADE_LATE = { day: { tempC: 21.1, rhPct: 55 }, night: { tempC: 15.6, rhPct: 40 } } as const;

export const WEEKLY_PLAN: GrowWeek[] = [
  // Veg wk 1-2 and flower wk 1-3: one climate for the whole block, no night differential.
  { week: 1, stage: 'veg', ppfdTarget: 400, airVpdTarget: 1.0, climateRef: EARLY },
  { week: 2, stage: 'veg', ppfdTarget: 555, airVpdTarget: 1.0, climateRef: EARLY },
  { week: 3, stage: 'flower', ppfdTarget: 925, airVpdTarget: 1.0, climateRef: EARLY },
  { week: 4, stage: 'flower', ppfdTarget: 1020, airVpdTarget: 1.0, climateRef: EARLY },
  { week: 5, stage: 'flower', ppfdTarget: 1080, airVpdTarget: 1.0, climateRef: EARLY },
  // Bulking: the book opens a 10 °F day/night split here and drops night RH to hold VPD.
  { week: 6, stage: 'flower', ppfdTarget: 1120, airVpdTarget: 1.1, climateRef: BULKING },
  { week: 7, stage: 'flower', ppfdTarget: 1155, airVpdTarget: 1.1, climateRef: BULKING },
  { week: 8, stage: 'flower', ppfdTarget: 1100, airVpdTarget: 1.1, climateRef: BULKING },
  // Fade. The book gives 1.1-1.2 for these; 1.15 is its midpoint, and the band clamps at 1.2.
  { week: 9, stage: 'ripen', ppfdTarget: 1000, airVpdTarget: 1.15, climateRef: FADE_EARLY },
  { week: 10, stage: 'ripen', ppfdTarget: 925, airVpdTarget: 1.15, climateRef: FADE_LATE }
];

/** Hard rails for the whole grow, CCI Black Book p.61: "never let the VPD dip below .8 during the
 *  entire veg and flower process and never rise above 1.2 VPD." The Homegrower Handbook p.26-27
 *  independently gives the same envelope (veg 0.8-1.0, flower 1.0-1.2). Every band clamps to these. */
export const AIR_VPD_HARD_MIN = 0.8;
export const AIR_VPD_HARD_MAX = 1.2;

/** Week-1 day 1 = the first day of named veg, after the transplanted clones' rooting-in week (local
 *  midnight). Before this the plan clamps to veg wk 1; weeksSince(now) drives stage/week thereafter. */
export const GROW_START = '2026-08-10';

/** Fixture falloff model (this light, measured): peak PPFD at 100% at the peak distance, and a
 *  ~1/distance falloff (NOT inverse-square). Intensity scales ~linearly with the dimmer duty. */
export const PEAK_PPFD = 1155;
export const PEAK_DISTANCE_CM = 33;

/** Within this |Δ%| of the week's target we call it on-target (guidance stops nagging). */
export const ON_TARGET_TOL_PCT = 8;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** Daily Light Integral (mol·m⁻²·d⁻¹) for a steady PPFD held for `onHours`. */
export function dliFor(ppfd: number, onHours: number): number {
  return (ppfd * onHours * 3600) / 1e6;
}

export interface WeeklyPoint {
  week: number;
  stage: StageKey;
  ppfdTarget: number;
  current: boolean;
}

export interface GrowState {
  week: number;
  stage: GrowStage;
  /** The current live PPFD target — day-resolved when the week has a ramp, else the week's flat value. */
  ppfdTarget: number;
  dliTarget: number;
  onHours: number;
  offHours: number;
  /** Days since planting (GROW_START), clamped ≥ 0. */
  dayOfGrow: number;
  /** The next ramp step within the current week, if any — for previewing "→ X on day Y". */
  nextRamp: { onDay: number; ppfd: number } | null;
  weekly: WeeklyPoint[];
  /** The week's ROOM (air) VPD target in kPa — what the climate loop regulates. */
  airVpdTarget: number;
  /** The book's temp/RH pairing for that VPD, for display beside it. */
  climateRef: { day: ClimateReference; night: ClimateReference };
}

/** Resolve the current stage/week/targets from the wall clock, clamped to the plan's bounds. */
export function resolveGrowState(now: Date, startIso: string = GROW_START): GrowState {
  const msSince = now.getTime() - new Date(startIso).getTime();
  const dayOfGrow = Math.max(0, Math.floor(msSince / MS_PER_DAY));
  const idx = Math.min(Math.max(Math.floor(msSince / MS_PER_WEEK), 0), WEEKLY_PLAN.length - 1);
  const wk = WEEKLY_PLAN[idx];
  const stage = STAGES[wk.stage];

  // Within-week day-stepped ramp (seedling climbs off the dome): the live target follows the current
  // day's step, and we surface the next step so the card can preview it. Flat weeks skip this.
  let ppfdTarget = wk.ppfdTarget;
  let nextRamp: { onDay: number; ppfd: number } | null = null;
  if (wk.ramp && wk.ramp.length > 0) {
    let current = wk.ramp[0];
    for (const step of wk.ramp) if (dayOfGrow >= step.fromDay) current = step;
    ppfdTarget = current.ppfd;
    const next = wk.ramp.find((s) => s.fromDay > dayOfGrow);
    if (next) nextRamp = { onDay: next.fromDay, ppfd: next.ppfd };
  }

  return {
    week: wk.week,
    stage,
    ppfdTarget,
    dliTarget: dliFor(ppfdTarget, stage.onHours),
    onHours: stage.onHours,
    offHours: stage.offHours,
    dayOfGrow,
    nextRamp,
    weekly: WEEKLY_PLAN.map((w, i) => ({
      week: w.week,
      stage: w.stage,
      ppfdTarget: w.ppfdTarget,
      current: i === idx
    })),
    airVpdTarget: wk.airVpdTarget,
    climateRef: wk.climateRef
  };
}

export type GuidanceStatus = 'on-target' | 'under' | 'over' | 'unknown';

export interface LightGuidance {
  status: GuidanceStatus;
  /** (live − target) / target · 100, or null when PPFD isn't calibrated. */
  deltaPct: number | null;
  /** Dimmer duty that would hit the target at the current height (may exceed 100 = must also lower the fixture). */
  dimmerForTargetPct: number | null;
  /** Model-inferred CURRENT center distance (needs the live reading + dimmer). */
  estDistanceCm: number | null;
  /** Full-power (100%) hang height for the target — the stable placement reference; always available. */
  targetDistanceCm: number | null;
  message: string;
}

/** Distance (cm) at which this fixture yields `ppfd` at `dimmerPct` duty, per the 1/distance model. */
function distanceForPpfd(ppfd: number, dimmerPct: number): number {
  return (PEAK_PPFD * (dimmerPct / 100) * PEAK_DISTANCE_CM) / ppfd;
}

const round = (n: number) => Math.round(n);

/** Turn live PPFD, dimmer duty and week target into a raise-the-dimmer or lower-the-fixture call. */
export function buildGuidance(
  livePpfd: number | null | undefined,
  dimmerPct: number | null | undefined,
  target: number
): LightGuidance {
  // Hang height at full power (100%) for the week's target — independent of the live reading and the
  // current dimmer, so it's always available as the reference placement.
  const targetDistanceCm = target > 0 ? distanceForPpfd(target, 100) : null;

  if (livePpfd == null || !(livePpfd > 0) || !(target > 0)) {
    return {
      status: 'unknown',
      deltaPct: null,
      dimmerForTargetPct: null,
      estDistanceCm: null,
      targetDistanceCm,
      message: 'Set a calibration anchor to see PPFD vs target guidance.'
    };
  }

  const deltaPct = ((livePpfd - target) / target) * 100;
  const hasDimmer = dimmerPct != null && dimmerPct > 0;
  const dimmerForTargetPct = hasDimmer ? dimmerPct * (target / livePpfd) : null;
  const estDistanceCm = hasDimmer ? distanceForPpfd(livePpfd, dimmerPct) : null;

  if (Math.abs(deltaPct) <= ON_TARGET_TOL_PCT) {
    return {
      status: 'on-target',
      deltaPct,
      dimmerForTargetPct,
      estDistanceCm,
      targetDistanceCm,
      message: `On target — ${round(livePpfd)} vs ${round(target)} µmol.`
    };
  }

  if (deltaPct < 0) {
    // The dimmer first, since a fixed-height ratio is reliable; height only as a relative move,
    // because the 1/distance model is far too rough to claim an absolute one.
    let message: string;
    if (dimmerForTargetPct != null && dimmerForTargetPct <= 100) {
      message = `Below target — raise intensity to ~${round(dimmerForTargetPct)}%.`;
    } else {
      const alreadyFull = dimmerPct != null && dimmerPct >= 99;
      message = alreadyFull
        ? `Below target — lower the fixture until PPFD reads ~${round(target)} µmol.`
        : `Below target — raise to 100%, then lower the fixture until PPFD reads ~${round(target)} µmol.`;
    }
    return {
      status: 'under',
      deltaPct,
      dimmerForTargetPct,
      estDistanceCm,
      targetDistanceCm,
      message
    };
  }

  // Over target: dim down (raising the fixture is the alternative).
  const message =
    dimmerForTargetPct != null
      ? `Above target — lower intensity to ~${round(dimmerForTargetPct)}% (or raise the fixture).`
      : `Above target by ${round(deltaPct)}% — lower intensity or raise the fixture.`;
  return { status: 'over', deltaPct, dimmerForTargetPct, estDistanceCm, targetDistanceCm, message };
}
