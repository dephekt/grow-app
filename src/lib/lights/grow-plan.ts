/**
 * The grow's light plan: per-week center-canopy PPFD targets, photoperiod by stage, and the
 * derived DLI + fixture-placement guidance. This is the ONE config to edit per grow — everything
 * the Lights page shows as a "target" flows from here; live values (PPFD, lux, dimmer) come from
 * the fleet. Targets are center-canopy (the fixture is uniformity-limited, so we run
 * center-weighted — see the light card's guidance).
 */

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
  veg: { key: 'veg', label: 'Veg', onHours: 20, offHours: 4 },
  flower: { key: 'flower', label: 'Flower', onHours: 12, offHours: 12 },
  ripen: { key: 'ripen', label: 'Ripen', onHours: 12, offHours: 12 }
};

export interface GrowWeek {
  /** 1-based overall grow week. */
  week: number;
  stage: StageKey;
  /** Center-canopy PPFD target, µmol·m⁻²·s⁻¹. */
  ppfdTarget: number;
}

/**
 * Compressed schedule for the current grow (Cannarado Papaya x Rainbow Crushers, from seed, CO₂):
 * 1 wk seedling → 1 wk veg → flip. Targets ramp through flower to a wk-7 peak, then ripen down.
 */
export const WEEKLY_PLAN: GrowWeek[] = [
  { week: 1, stage: 'seedling', ppfdTarget: 230 },
  { week: 2, stage: 'veg', ppfdTarget: 555 },
  { week: 3, stage: 'flower', ppfdTarget: 925 },
  { week: 4, stage: 'flower', ppfdTarget: 1020 },
  { week: 5, stage: 'flower', ppfdTarget: 1080 },
  { week: 6, stage: 'flower', ppfdTarget: 1120 },
  { week: 7, stage: 'flower', ppfdTarget: 1155 },
  { week: 8, stage: 'flower', ppfdTarget: 1100 },
  { week: 9, stage: 'ripen', ppfdTarget: 1000 },
  { week: 10, stage: 'ripen', ppfdTarget: 925 }
];

/** Midnight of week-1 day 1 (local). weeksSince(now) drives the current stage/week. */
export const GROW_START = '2026-07-12';

/** Fixture falloff model (this light, measured): peak PPFD at 100% at the peak distance, and a
 *  ~1/distance falloff (NOT inverse-square). Intensity scales ~linearly with the dimmer duty. */
export const PEAK_PPFD = 1155;
export const PEAK_DISTANCE_CM = 33;

/** Within this |Δ%| of the week's target we call it on-target (guidance stops nagging). */
export const ON_TARGET_TOL_PCT = 8;

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

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
  ppfdTarget: number;
  dliTarget: number;
  onHours: number;
  offHours: number;
  weekly: WeeklyPoint[];
}

/** Resolve the current stage/week/targets from the wall clock, clamped to the plan's bounds. */
export function resolveGrowState(now: Date, startIso: string = GROW_START): GrowState {
  const weeksSince = Math.floor((now.getTime() - new Date(startIso).getTime()) / MS_PER_WEEK);
  const idx = Math.min(Math.max(weeksSince, 0), WEEKLY_PLAN.length - 1);
  const wk = WEEKLY_PLAN[idx];
  const stage = STAGES[wk.stage];
  return {
    week: wk.week,
    stage,
    ppfdTarget: wk.ppfdTarget,
    dliTarget: dliFor(wk.ppfdTarget, stage.onHours),
    onHours: stage.onHours,
    offHours: stage.offHours,
    weekly: WEEKLY_PLAN.map((w, i) => ({ week: w.week, stage: w.stage, ppfdTarget: w.ppfdTarget, current: i === idx }))
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

/**
 * Turn a live center PPFD + dimmer duty + week target into an operational suggestion: raise the
 * dimmer, or (when 100% still wouldn't reach target) lower the fixture by the modelled distance.
 * Returns `unknown` when PPFD isn't calibrated yet.
 */
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
  const dimmerForTargetPct = hasDimmer ? (dimmerPct as number) * (target / livePpfd) : null;
  const estDistanceCm = hasDimmer ? distanceForPpfd(livePpfd, dimmerPct as number) : null;

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
    // Under target. First lever is the dimmer: if bumping it (≤100%) at the current height reaches
    // target, say exactly that — a fixed-height linear ratio, so it's reliable. Otherwise the fixture
    // must come down; we DON'T claim an absolute height (the 1/distance model + lux anchor are far too
    // rough to reconstruct one — see targetDistanceCm) and instead point at the live canopy PPFD, which
    // is ground truth. (One fixture in the tent — never suggest adding another.)
    let message: string;
    if (dimmerForTargetPct != null && dimmerForTargetPct <= 100) {
      message = `Below target — raise intensity to ~${round(dimmerForTargetPct)}%.`;
    } else {
      const alreadyFull = dimmerPct != null && dimmerPct >= 99;
      message = alreadyFull
        ? `Below target — lower the fixture until PPFD reads ~${round(target)} µmol.`
        : `Below target — raise to 100%, then lower the fixture until PPFD reads ~${round(target)} µmol.`;
    }
    return { status: 'under', deltaPct, dimmerForTargetPct, estDistanceCm, targetDistanceCm, message };
  }

  // Over target: dim down (raising the fixture is the alternative).
  const message =
    dimmerForTargetPct != null
      ? `Above target — lower intensity to ~${round(dimmerForTargetPct)}% (or raise the fixture).`
      : `Above target by ${round(deltaPct)}% — lower intensity or raise the fixture.`;
  return { status: 'over', deltaPct, dimmerForTargetPct, estDistanceCm, targetDistanceCm, message };
}
