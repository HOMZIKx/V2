import { describe, expect, it } from 'vitest';

import { timingSafeEqualUtf8 } from './timing-safe-equal.js';

describe('timingSafeEqualUtf8', () => {
  it('accepts equal secrets of any length', () => {
    expect(timingSafeEqualUtf8('proj-secret', 'proj-secret')).toBe(true);
    expect(timingSafeEqualUtf8('', '')).toBe(true);
  });

  it('rejects mismatched secrets including length differences', () => {
    expect(timingSafeEqualUtf8('proj-secret', 'wrong')).toBe(false);
    expect(timingSafeEqualUtf8('short', 'much-longer-secret')).toBe(false);
  });
});
