import { describe, expect, it } from 'vitest';

import { offerMatchesWatch } from './marketplace.js';

describe('marketplace matching', () => {
  it('matches category and query with price filter', () => {
    const offer = {
      side: 'SELL' as const,
      categoryKey: 'weapons',
      itemLabel: 'Miecz +9',
      priceAmount: 100,
      budgetAmount: null,
      status: 'open' as const,
    };
    expect(
      offerMatchesWatch(offer, {
        side: 'SELL',
        categoryKey: 'weapons',
        itemQuery: 'miecz',
        maxPrice: 150,
      }),
    ).toBe(true);
    expect(offerMatchesWatch(offer, { maxPrice: 50 })).toBe(false);
  });
});
