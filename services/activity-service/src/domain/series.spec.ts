import { describe, expect, it } from 'vitest';

import {
  assertSeriesHorizon,
  expandSeriesOccurrenceStarts,
  SERIES_MAX_HORIZON_DAYS,
} from './series.js';

describe('series expansion', () => {
  it('expands daily occurrences within horizon', () => {
    const first = new Date('2026-08-20T18:00:00.000Z');
    const horizon = new Date('2026-08-22T18:00:00.000Z');
    const starts = expandSeriesOccurrenceStarts({
      kind: 'daily',
      firstStartAt: first,
      horizonEndAt: horizon,
    });
    expect(starts).toHaveLength(3);
    expect(starts[0]?.toISOString()).toBe(first.toISOString());
  });

  it('expands selected weekdays only', () => {
    const first = new Date('2026-08-17T18:00:00.000Z'); // Monday
    const horizon = new Date('2026-08-24T18:00:00.000Z');
    const starts = expandSeriesOccurrenceStarts({
      kind: 'weekdays',
      firstStartAt: first,
      horizonEndAt: horizon,
      weekdays: [1, 3], // Mon, Wed
    });
    expect(starts.map((d) => d.toISOString())).toEqual([
      '2026-08-17T18:00:00.000Z',
      '2026-08-19T18:00:00.000Z',
      '2026-08-24T18:00:00.000Z',
    ]);
  });

  it('rejects horizon beyond 90 days', () => {
    const now = new Date('2026-08-20T12:00:00.000Z');
    const first = now;
    const horizon = new Date(now.getTime() + (SERIES_MAX_HORIZON_DAYS + 1) * 86400000);
    expect(() => assertSeriesHorizon(first, horizon, now)).toThrow(/90 days/);
  });
});
