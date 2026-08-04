import { describe, expect, it } from 'vitest';

import { HealthStatusSchema } from './health.js';

describe('HealthStatusSchema', () => {
  it('accepts the stable healthy response', () => {
    expect(HealthStatusSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('rejects unsupported statuses', () => {
    expect(HealthStatusSchema.safeParse({ status: 'degraded' }).success).toBe(false);
  });
});
