import { describe, expect, it } from 'vitest';

import { expectHealthyStatus } from './index.js';

describe('expectHealthyStatus', () => {
  it('accepts a healthy payload', () => {
    expect(() => expectHealthyStatus({ status: 'ok' })).not.toThrow();
    expect(() =>
      expectHealthyStatus({ status: 'ok', gitCommitSha: 'abc', appVersion: '1.0.0' }),
    ).not.toThrow();
  });

  it('rejects an unhealthy payload', () => {
    expect(() => expectHealthyStatus({ status: 'down' })).toThrow();
  });
});
