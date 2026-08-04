import { describe, expect, it } from 'vitest';

import { getToneColor } from './status-badge.js';

describe('getToneColor', () => {
  it('returns the accessible color for each supported tone', () => {
    expect(getToneColor('ok')).toBe('#15803d');
    expect(getToneColor('warn')).toBe('#a16207');
    expect(getToneColor('error')).toBe('#b91c1c');
  });
});
