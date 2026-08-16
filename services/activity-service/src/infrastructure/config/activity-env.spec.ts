import { describe, expect, it } from 'vitest';

import { ActivityConfigError, parseActivityEnv } from './activity-env.js';

describe('parseActivityEnv', () => {
  it('requires ACTIVITY_DATABASE_URL', () => {
    expect(() => parseActivityEnv({})).toThrow(ActivityConfigError);
  });

  it('defaults worker off and port 4400', () => {
    const env = parseActivityEnv({
      ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
    });
    expect(env.ACTIVITY_SERVICE_PORT).toBe(4400);
    expect(env.ACTIVITY_ENABLED).toBe(false);
    expect(env.ACTIVITY_OUTBOX_WORKER_ENABLED).toBe(false);
    expect(env.ACTIVITY_TO_AUTHZ_CLIENT_ID).toBe('v2.activity-service');
  });

  it('requires authz signing when ACTIVITY_ENABLED=true', () => {
    expect(() =>
      parseActivityEnv({
        ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
        ACTIVITY_ENABLED: 'true',
      }),
    ).toThrow(/ACTIVITY_AUTHORIZATION_BASE_URL/);
  });

  it('caps client assertion TTL at 60', () => {
    expect(() =>
      parseActivityEnv({
        ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
        ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS: '61',
      }),
    ).toThrow(ActivityConfigError);
  });
});
