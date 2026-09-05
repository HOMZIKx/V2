import { describe, expect, it } from 'vitest';

import { HealthStatusSchema } from './health.js';
import * as contracts from './index.js';

describe('HealthStatusSchema', () => {
  it('exposes the package entrypoint', () => {
    expect(contracts.HealthStatusSchema).toBe(HealthStatusSchema);
  });
  it('accepts the stable healthy response', () => {
    expect(HealthStatusSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('accepts optional revision metadata', () => {
    expect(
      HealthStatusSchema.parse({
        status: 'ok',
        gitCommitSha: 'abc1234',
        appVersion: '0.0.0-dev',
      }),
    ).toEqual({
      status: 'ok',
      gitCommitSha: 'abc1234',
      appVersion: '0.0.0-dev',
    });
  });

  it('rejects unsupported statuses', () => {
    expect(HealthStatusSchema.safeParse({ status: 'degraded' }).success).toBe(false);
  });
});
