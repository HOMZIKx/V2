import { describe, expect, it } from 'vitest';

import {
  claimNotifyIdempotencyKey,
  releaseNotifyIdempotencyKey,
  resetNotifyIdempotencyWindow,
} from './notify-idempotency.js';

describe('notify idempotency', () => {
  it('rejects duplicate keys inside the window', () => {
    resetNotifyIdempotencyWindow();
    expect(claimNotifyIdempotencyKey('n-1', 1_000)).toBe(true);
    expect(claimNotifyIdempotencyKey('n-1', 1_100)).toBe(false);
    expect(claimNotifyIdempotencyKey('n-2', 1_100)).toBe(true);
  });

  it('allows reuse after the window', () => {
    resetNotifyIdempotencyWindow();
    expect(claimNotifyIdempotencyKey('n-1', 1_000)).toBe(true);
    expect(claimNotifyIdempotencyKey('n-1', 1_000 + 60_001)).toBe(true);
  });

  it('allows reuse after explicit release', () => {
    resetNotifyIdempotencyWindow();
    expect(claimNotifyIdempotencyKey('n-1', 1_000)).toBe(true);
    releaseNotifyIdempotencyKey('n-1');
    expect(claimNotifyIdempotencyKey('n-1', 1_100)).toBe(true);
  });
});
