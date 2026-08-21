// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import {
  allSeriesHidden,
  drawnSeries,
  isSeriesShown,
  maxYAxes,
  seriesScale,
  structureSignature,
  yAxisPlans,
  yAxisSlotSignature,
  yAxisSlots,
  zoomWindowLabel,
  zoomedWindow
} from '../../src/lib/trends-chart';
import type { TrendSeries } from '../../src/lib/trends';

function ser(key: string, unit: string, extra: Partial<TrendSeries> = {}): TrendSeries {
  return { key, label: key, unit, points: [], ...extra };
}

const SUBSTRATE = [ser('vwc', '%'), ser('pwec', 'mS/cm'), ser('temp', '°C')];

/** Climate resolves its units in this order, so kPa/lx/hPa can never get a labelled axis today. */
const CLIMATE = [
  ser('co2', 'ppm'),
  ser('temperature', '°C'),
  ser('humidity', '%'),
  ser('vpd', 'kPa'),
  ser('illuminance', 'lx'),
  ser('pressure', 'hPa')
];

const P = [{ t: '2026-08-04T00:00:00Z', v: 1 }];

function sampled(key: string, unit: string, extra: Partial<TrendSeries> = {}): TrendSeries {
  return ser(key, unit, { points: P, ...extra });
}

/** Every subset of `n` series as a drawn-mask, for asserting an invariant over all of them. */
function everyMask(n: number): boolean[][] {
  return Array.from({ length: 1 << n }, (_, bits) =>
    Array.from({ length: n }, (_, i) => (bits & (1 << i)) !== 0)
  );
}

describe('seriesScale', () => {
  it('scales on the unit so same-unit series share an axis', () => {
    expect(seriesScale(ser('pwec', 'mS/cm'))).toBe('mS/cm');
    expect(seriesScale(ser('bulk-ec', 'mS/cm'))).toBe('mS/cm');
  });

  it('falls back to the key so an unitless series autoranges alone', () => {
    expect(seriesScale(ser('raw', ''))).toBe('raw');
  });
});

describe('isSeriesShown', () => {
  it('falls back to the declared visibility when the legend has not spoken', () => {
    expect(isSeriesShown(ser('a', ''))).toBe(true);
    expect(isSeriesShown(ser('a', '', { hidden: true }))).toBe(false);
    expect(isSeriesShown(ser('a', ''), new Map())).toBe(true);
  });

  it('lets a legend toggle override the hidden seed both ways', () => {
    expect(isSeriesShown(ser('a', '', { hidden: true }), new Map([['a', true]]))).toBe(true);
    expect(isSeriesShown(ser('a', ''), new Map([['a', false]]))).toBe(false);
  });
});

describe('allSeriesHidden', () => {
  it('is false while anything is on, true once nothing is', () => {
    expect(allSeriesHidden(SUBSTRATE)).toBe(false);
    expect(
      allSeriesHidden(
        SUBSTRATE,
        new Map([
          ['vwc', false],
          ['pwec', false]
        ])
      )
    ).toBe(false);
    expect(
      allSeriesHidden(
        SUBSTRATE,
        new Map([
          ['vwc', false],
          ['pwec', false],
          ['temp', false]
        ])
      )
    ).toBe(true);
  });

  it('counts the server seed, not just legend clicks', () => {
    expect(allSeriesHidden([ser('bulk-ec', 'mS/cm', { hidden: true })])).toBe(true);
  });

  /** The "No history yet" overlay owns that case; two overlays would stack. */
  it('has nothing to hide with no series', () => {
    expect(allSeriesHidden([])).toBe(false);
  });
});

describe('drawnSeries', () => {
  it('falls back to having samples before the plot exists', () => {
    expect(drawnSeries([sampled('a', '%'), ser('b', '°C')], undefined, null)).toEqual([
      true,
      false
    ]);
  });

  it('drops a series the legend switched off', () => {
    expect(
      drawnSeries([sampled('a', '%'), sampled('b', '°C')], new Map([['a', false]]), null)
    ).toEqual([false, true]);
  });

  /** Drag-zooming into a gap empties a series; uPlot's own test is whether the scale ranged. */
  it('drops a series whose scale never ranged', () => {
    expect(drawnSeries([sampled('a', '%'), sampled('b', '°C')], undefined, new Set(['%']))).toEqual(
      [true, false]
    );
  });

  it('keeps both series on a scale that ranged', () => {
    expect(
      drawnSeries(
        [sampled('pwec', 'mS/cm'), sampled('bulk-ec', 'mS/cm')],
        undefined,
        new Set(['mS/cm'])
      )
    ).toEqual([true, true]);
  });

  it('scales an unitless series on its key', () => {
    expect(drawnSeries([sampled('raw', '')], undefined, new Set(['raw']))).toEqual([true]);
    expect(drawnSeries([sampled('raw', '')], undefined, new Set(['%']))).toEqual([false]);
  });
});

describe('yAxisPlans', () => {
  it('gives each unit an axis, alternating sides in first-appearance order', () => {
    const plans = yAxisPlans(SUBSTRATE, 900);
    expect(plans.map((p) => p.scale)).toEqual(['%', 'mS/cm', '°C']);
    expect(plans.map((p) => p.side)).toEqual([3, 1, 3]);
  });

  /** Two sets of horizontal lines at different intervals is visual noise, not more information. */
  it('lets only the innermost axis draw the grid', () => {
    expect(yAxisPlans(SUBSTRATE, 900).map((p) => p.grid)).toEqual([true, false, false]);
  });

  it('points each axis at the first series on its scale, for colour matching', () => {
    const withBulk = [...SUBSTRATE, ser('bulk-ec', 'mS/cm')];
    // Bulk EC shares pwEC's scale, so the mS/cm axis still takes pwEC's colour.
    expect(yAxisPlans(withBulk, 900).map((p) => p.seriesIndex)).toEqual([0, 1, 2]);
  });

  it('drops axes rather than squeezing the plot as the panel narrows', () => {
    expect(yAxisPlans(SUBSTRATE, 900)).toHaveLength(3);
    expect(yAxisPlans(SUBSTRATE, 600)).toHaveLength(2);
    expect(yAxisPlans(SUBSTRATE, 400)).toHaveLength(1);
    expect(maxYAxes(479)).toBe(1);
    expect(maxYAxes(480)).toBe(2);
    expect(maxYAxes(760)).toBe(3);
  });

  /**
   * Water resolves five units. Five labelled axes would eat a third of the plot, and the
   * overflow still autoranges correctly — uPlot ranges scales from series, not axes — so
   * capping only costs a label, which is what every unit gets today.
   */
  it('caps the axis count without dropping the series behind it', () => {
    const water = [
      ser('ph', 'pH'),
      ser('orp', 'mV'),
      ser('ec', 'µS/cm'),
      ser('tds', 'ppm'),
      ser('temp', '°C')
    ];
    const plans = yAxisPlans(water, 900);
    expect(plans).toHaveLength(3);
    expect(plans.map((p) => p.scale)).toEqual(['pH', 'mV', 'µS/cm']);
  });

  it('keeps one gridded axis when a single unit is charted', () => {
    const plans = yAxisPlans([ser('vwc', '%')], 900);
    expect(plans).toEqual([{ scale: '%', unit: '%', side: 3, grid: true, seriesIndex: 0 }]);
  });

  /** Without this the grid disappears entirely, since only a y axis draws horizontal lines. */
  it('keeps a zero-width grid axis when nothing declares a unit', () => {
    const plans = yAxisPlans([ser('a', ''), ser('b', '')], 900);
    expect(plans).toEqual([{ scale: 'a', unit: '', side: 3, grid: true, seriesIndex: 0 }]);
  });

  it('labels only the united scales when units are mixed in', () => {
    const plans = yAxisPlans([ser('raw', ''), ser('vwc', '%')], 900);
    expect(plans.map((p) => p.scale)).toEqual(['%']);
    expect(plans[0].seriesIndex).toBe(1);
  });

  it('plans nothing for no series', () => {
    expect(yAxisPlans([], 900)).toEqual([]);
  });

  /**
   * The reported bug, stated as a test: CO2 holds the first slot, so hiding it used to waste
   * that slot rather than hand it to the next unit down.
   */
  it('promotes the next unit into the slot a hidden one vacated', () => {
    expect(yAxisPlans(CLIMATE, 900).map((p) => p.scale)).toEqual(['ppm', '°C', '%']);
    const noCo2 = [false, true, true, true, true, true];
    expect(yAxisPlans(CLIMATE, 900, noCo2).map((p) => p.scale)).toEqual(['°C', '%', 'kPa']);
  });

  it('promotes at every width class', () => {
    const noCo2 = [false, true, true, true, true, true];
    expect(yAxisPlans(CLIMATE, 600, noCo2).map((p) => p.scale)).toEqual(['°C', '%']);
    expect(yAxisPlans(CLIMATE, 400, noCo2).map((p) => p.scale)).toEqual(['°C']);
  });

  /** Hiding the first-declared unit used to kill the horizontal grid with it. */
  it('alternates sides and grants the grid by slot, not by declared order', () => {
    const plans = yAxisPlans(CLIMATE, 900, [false, true, true, true, true, true]);
    expect(plans.map((p) => p.side)).toEqual([3, 1, 3]);
    expect(plans.map((p) => p.grid)).toEqual([true, false, false]);
  });

  it('drops a unit whose only series is masked off', () => {
    const plans = yAxisPlans([ser('vwc', '%'), ser('pwec', 'mS/cm')], 900, [true, false]);
    expect(plans.map((p) => p.scale)).toEqual(['%']);
  });

  it('colours an axis from the first drawn series on its scale, by declared index', () => {
    const withBulk = [...SUBSTRATE, ser('bulk-ec', 'mS/cm')];
    const plans = yAxisPlans(withBulk, 900, [true, false, true, true]);
    expect(plans.map((p) => p.scale)).toEqual(['%', '°C', 'mS/cm']);
    // Declared indices, so the palette never shifts under a toggle.
    expect(plans.map((p) => p.seriesIndex)).toEqual([0, 2, 3]);
  });

  it('falls back to a grid-only axis on the first drawn unitless series', () => {
    expect(yAxisPlans([ser('a', ''), ser('b', '')], 900, [false, true])).toEqual([
      { scale: 'b', unit: '', side: 3, grid: true, seriesIndex: 1 }
    ]);
  });

  /** uPlot pads a one-entry `axes` back to two, so an empty plan would grow a phantom y axis. */
  it('never plans nothing while there are series', () => {
    expect(
      yAxisPlans(
        CLIMATE,
        900,
        CLIMATE.map(() => false)
      )
    ).toEqual([{ scale: 'ppm', unit: '', side: 3, grid: true, seriesIndex: 0 }]);
  });

  it('treats an all-true mask as no mask', () => {
    expect(
      yAxisPlans(
        CLIMATE,
        900,
        CLIMATE.map(() => true)
      )
    ).toEqual(yAxisPlans(CLIMATE, 900));
  });
});

describe('yAxisSlots', () => {
  const NO_CO2 = [false, true, true, true, true, true];
  const ALL_OFF = CLIMATE.map(() => false);

  /** The invariant that lets the reconcile index `u.axes` without a bounds check. */
  it('keeps one slot per declared axis, whatever the mask', () => {
    expect(
      [
        yAxisSlots(CLIMATE, 900),
        yAxisSlots(CLIMATE, 900, NO_CO2),
        yAxisSlots(CLIMATE, 900, ALL_OFF)
      ].map((s) => s.length)
    ).toEqual([3, 3, 3]);
  });

  it('promotes into the freed slot', () => {
    expect(yAxisSlots(CLIMATE, 900, NO_CO2).map((s) => s.unit)).toEqual(['°C', '%', 'kPa']);
  });

  /** Never an invented key, so `u.scales[slot.scale]` exists even while parked. */
  it('parks a surplus slot on a real scale key', () => {
    expect(yAxisSlots(SUBSTRATE, 900, [true, false, false]).map((s) => [s.scale, s.unit])).toEqual([
      ['%', '%'],
      ['mS/cm', ''],
      ['°C', '']
    ]);
  });

  it('parks every slot when the legend hides everything', () => {
    const slots = yAxisSlots(CLIMATE, 900, ALL_OFF);
    expect(slots.map((s) => s.unit)).toEqual(['', '', '']);
    expect(slots.map((s) => s.scale)).toEqual(['ppm', '°C', '%']);
  });

  it('keeps the grid on slot 0 and never colours it from a hidden series', () => {
    for (const mask of everyMask(SUBSTRATE.length)) {
      if (!mask.some(Boolean)) continue;
      const slots = yAxisSlots(SUBSTRATE, 900, mask);
      expect(slots[0].grid).toBe(true);
      expect(mask[slots[0].seriesIndex]).toBe(true);
    }
  });

  /** Sides belong to the slot, so nothing jumps left-to-right as you toggle. */
  it('pins each side to its slot, not to its unit', () => {
    for (const mask of everyMask(CLIMATE.length)) {
      expect(yAxisSlots(CLIMATE, 900, mask).map((s) => s.side)).toEqual([3, 1, 3]);
    }
  });

  it('caps at the width class and lets the mask pick which unit fills the one slot', () => {
    const slots = yAxisSlots(SUBSTRATE, 400, [false, true, true]);
    expect(slots).toHaveLength(1);
    expect([slots[0].scale, slots[0].unit]).toEqual(['mS/cm', 'mS/cm']);
  });
});

describe('yAxisSlotSignature', () => {
  it('changes when a slot swaps scale and is stable when it does not', () => {
    const base = yAxisSlotSignature(yAxisSlots(CLIMATE, 900));
    expect(
      yAxisSlotSignature(yAxisSlots(CLIMATE, 900, [false, true, true, true, true, true]))
    ).not.toBe(base);
    expect(
      yAxisSlotSignature(
        yAxisSlots(
          CLIMATE,
          900,
          CLIMATE.map(() => true)
        )
      )
    ).toBe(base);
  });

  /** Only the colour source moves here, and the reconcile still has to repaint the stroke. */
  it('changes when only the axis colour moves', () => {
    const withBulk = [...SUBSTRATE, ser('bulk-ec', 'mS/cm')];
    expect(yAxisSlotSignature(yAxisSlots(withBulk, 900, [true, false, true, true]))).not.toBe(
      yAxisSlotSignature(yAxisSlots(withBulk, 900))
    );
  });
});

describe('structureSignature', () => {
  it('is stable when only the points change, so a refetch reuses the plot', () => {
    const before = structureSignature(SUBSTRATE, 900);
    const after = structureSignature(
      SUBSTRATE.map((s) => ({ ...s, points: [{ t: '2026-08-04T00:00:00Z', v: 1 }] })),
      900
    );
    expect(after).toBe(before);
  });

  it('changes when a unit changes', () => {
    const moved = [ser('vwc', '%'), ser('pwec', 'mS/cm'), ser('temp', '°F')];
    expect(structureSignature(moved, 900)).not.toBe(structureSignature(SUBSTRATE, 900));
  });

  it('changes when a series flips hidden', () => {
    const shown = [ser('vwc', '%'), ser('bulk-ec', 'mS/cm')];
    const hidden = [ser('vwc', '%'), ser('bulk-ec', 'mS/cm', { hidden: true })];
    expect(structureSignature(hidden, 900)).not.toBe(structureSignature(shown, 900));
  });

  /** Narrowing past a breakpoint drops an axis, and only a rebuild can remove one. */
  it('changes when the width crosses an axis-count class', () => {
    expect(structureSignature(SUBSTRATE, 400)).not.toBe(structureSignature(SUBSTRATE, 900));
    expect(structureSignature(SUBSTRATE, 800)).toBe(structureSignature(SUBSTRATE, 900));
  });

  /** The crux: if this ever fails, toggling a series destroys the plot the toggle lives in. */
  it('is unmoved by a legend toggle that re-plans the axes', () => {
    const charted = CLIMATE.map((s) => sampled(s.key, s.unit));
    const before = structureSignature(charted, 900);
    const mask = drawnSeries(charted, new Map([['co2', false]]), null);
    expect(structureSignature(charted, 900)).toBe(before);
    expect(yAxisSlots(charted, 900, mask).map((s) => s.unit)).toEqual(['°C', '%', 'kPa']);
    expect(yAxisSlotSignature(yAxisSlots(charted, 900, mask))).not.toBe(
      yAxisSlotSignature(yAxisSlots(charted, 900))
    );
  });
});

describe('zoomedWindow', () => {
  const xs = [100, 200, 300, 400];

  it('reads a window at the data bounds as unzoomed', () => {
    expect(zoomedWindow(xs, 100, 400)).toBeNull();
  });

  it('reads a window wider than the data as unzoomed', () => {
    expect(zoomedWindow(xs, 50, 500)).toBeNull();
  });

  it('reports a narrower window', () => {
    expect(zoomedWindow(xs, 150, 350)).toEqual({ min: 150, max: 350 });
  });

  it('reports a window clipped on one side only', () => {
    expect(zoomedWindow(xs, 100, 350)).toEqual({ min: 100, max: 350 });
  });

  it('has nothing to report before the scale is set or with no data', () => {
    expect(zoomedWindow(xs, null, null)).toBeNull();
    expect(zoomedWindow(xs, undefined, undefined)).toBeNull();
    expect(zoomedWindow([], 150, 350)).toBeNull();
  });
});

describe('zoomWindowLabel', () => {
  const noon = Date.parse('2026-08-04T12:00:00Z') / 1000;

  it('shows clock time alone inside one day', () => {
    const label = zoomWindowLabel(noon, noon + 7200, 'UTC');
    expect(label).toContain('→');
    expect(label).not.toMatch(/Aug/);
  });

  it('adds the date once the window spans more than a day', () => {
    expect(zoomWindowLabel(noon, noon + 3 * 86400, 'UTC')).toMatch(/Aug/);
  });
});
