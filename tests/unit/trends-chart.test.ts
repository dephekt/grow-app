// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import {
  maxYAxes,
  seriesScale,
  structureSignature,
  yAxisPlans,
  zoomWindowLabel,
  zoomedWindow
} from '../../src/lib/trends-chart';
import type { TrendSeries } from '../../src/lib/trends';

function ser(key: string, unit: string, extra: Partial<TrendSeries> = {}): TrendSeries {
  return { key, label: key, unit, points: [], ...extra };
}

const SUBSTRATE = [ser('vwc', '%'), ser('pwec', 'mS/cm'), ser('temp', '°C')];

describe('seriesScale', () => {
  it('scales on the unit so same-unit series share an axis', () => {
    expect(seriesScale(ser('pwec', 'mS/cm'))).toBe('mS/cm');
    expect(seriesScale(ser('bulk-ec', 'mS/cm'))).toBe('mS/cm');
  });

  it('falls back to the key so an unitless series autoranges alone', () => {
    expect(seriesScale(ser('raw', ''))).toBe('raw');
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
