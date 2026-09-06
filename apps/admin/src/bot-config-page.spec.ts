import { describe, expect, it } from 'vitest';

import { computeNotifyAt } from './bot-config-page.js';

describe('computeNotifyAt', () => {
  it('defaults 18:00 war with 30 min lead to 17:30 Warsaw', () => {
    expect(computeNotifyAt('18:00', 30)).toBe('17:30');
  });

  it('wraps past midnight', () => {
    expect(computeNotifyAt('00:15', 30)).toBe('23:45');
  });

  it('rejects bad warAt', () => {
    expect(computeNotifyAt('25:00', 30)).toBeNull();
  });
});
