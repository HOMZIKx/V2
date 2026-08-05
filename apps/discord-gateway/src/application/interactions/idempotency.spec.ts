import { describe, expect, it } from 'vitest';

import { claimInteractionId, resetIdempotencyWindow } from './idempotency.js';

describe('idempotency', () => {
  it('rejects duplicate interaction ids inside the window', () => {
    resetIdempotencyWindow();
    expect(claimInteractionId('i-1', 1_000)).toBe(true);
    expect(claimInteractionId('i-1', 1_100)).toBe(false);
    expect(claimInteractionId('i-2', 1_100)).toBe(true);
  });
});
