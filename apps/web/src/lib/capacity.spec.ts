import { describe, expect, it } from 'vitest';

import { formatEventCapacity } from './capacity';

describe('formatEventCapacity', () => {
  it('uses occupied/limit for finite events', () => {
    expect(formatEventCapacity(3, 8)).toBe('Miejsca: 3/8');
  });

  it('uses bez limitu for unlimited events', () => {
    expect(formatEventCapacity(3, null)).toBe('Miejsca: bez limitu · zapisanych: 3');
  });
});
