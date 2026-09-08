import { describe, expect, it } from 'vitest';

import { attributedAmount } from '../domain/team-economy.js';

describe('economy request split rule', () => {
  it('keeps money percentage precise while item counts stay integral', () => {
    const item = { totalQuantity: 5, ourQuantity: 2 };
    const money = { totalAmount: 1_000, ourShareBasisPoints: 5_000 };

    expect(Number.isInteger(item.totalQuantity)).toBe(true);
    expect(Number.isInteger(item.ourQuantity)).toBe(true);
    expect(attributedAmount(money.totalAmount, money.ourShareBasisPoints)).toBe(500);
  });
});
