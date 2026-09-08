import { describe, expect, it } from 'vitest';

import { attributedAmount, splitOwnedQuantity, suggestedOwnedQuantity } from './team-economy.js';

describe('team economy math', () => {
  it('keeps item ownership in whole units', () => {
    expect(suggestedOwnedQuantity(5, 5_000)).toBe(2);
    expect(suggestedOwnedQuantity(6, 5_000)).toBe(3);
    expect(suggestedOwnedQuantity(5, 10_000)).toBe(5);
  });

  it('maximises an equal physical item split and keeps only remainder aside', () => {
    expect(splitOwnedQuantity(5, 3, 'max_equal')).toEqual({
      perPile: 1,
      distributed: 3,
      leftover: 2,
    });
    expect(splitOwnedQuantity(6, 3, 'max_equal')).toEqual({
      perPile: 2,
      distributed: 6,
      leftover: 0,
    });
  });

  it('can require perfectly identical physical item piles', () => {
    expect(splitOwnedQuantity(5, 3, 'strict_equal')).toEqual({
      perPile: 0,
      distributed: 0,
      leftover: 5,
    });
    expect(splitOwnedQuantity(6, 3, 'strict_equal')).toEqual({
      perPile: 2,
      distributed: 6,
      leftover: 0,
    });
  });

  it('splits money percentage-wise without integer rounding', () => {
    expect(attributedAmount(1_000, 5_000)).toBe(500);
    expect(attributedAmount(900, 6_667)).toBeCloseTo(600.03);
    expect(attributedAmount(1, 3_333)).toBeCloseTo(0.3333);
  });
});
