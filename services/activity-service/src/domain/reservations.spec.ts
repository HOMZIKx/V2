import { describe, expect, it } from 'vitest';

import { assertNoDoubleBooking, intervalsOverlap } from './reservations.js';

describe('reservations conflict', () => {
  it('detects overlapping intervals', () => {
    expect(
      intervalsOverlap({ startsAtMs: 100, endsAtMs: 200 }, { startsAtMs: 150, endsAtMs: 250 }),
    ).toBe(true);
    expect(
      intervalsOverlap({ startsAtMs: 100, endsAtMs: 200 }, { startsAtMs: 200, endsAtMs: 300 }),
    ).toBe(false);
  });

  it('blocks double booking', () => {
    const result = assertNoDoubleBooking({
      candidate: { startsAtMs: 10, endsAtMs: 20 },
      existing: [{ startsAtMs: 15, endsAtMs: 25 }],
    });
    expect(result.ok).toBe(false);
  });
});
