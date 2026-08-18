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
    expect(env.ACTIVITY_ALLOW_TEST_SEED).toBe(false);
    expect(env.ACTIVITY_TRUST_ACTOR_HEADERS).toBe(false);
    expect(env.ACTIVITY_TO_AUTHZ_CLIENT_ID).toBe('v2.activity-service');
    expect(env.ACTIVITY_TO_DISCORD_CLIENT_ID).toBe('v2.activity-service');
  });

  it('requires Discord projection base URL when outbox worker enabled', () => {
    expect(() =>
      parseActivityEnv({
        ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
        ACTIVITY_OUTBOX_WORKER_ENABLED: 'true',
      }),
    ).toThrow(/ACTIVITY_DISCORD_PROJECTION_BASE_URL/);
  });

  it('requires projection shared secret when outbox worker enabled', () => {
    expect(() =>
      parseActivityEnv({
        ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
        ACTIVITY_OUTBOX_WORKER_ENABLED: 'true',
        ACTIVITY_DISCORD_PROJECTION_BASE_URL: 'http://127.0.0.1:4100',
      }),
    ).toThrow(/ACTIVITY_PROJECTION_SHARED_SECRET/);
  });

  it('requires authz signing when ACTIVITY_ENABLED=true', () => {
    expect(() =>
      parseActivityEnv({
        ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
        ACTIVITY_ENABLED: 'true',
      }),
    ).toThrow(/ACTIVITY_AUTHORIZATION_BASE_URL/);
  });

  it('rejects ACTIVITY_ALLOW_TEST_SEED in production', () => {
    expect(() =>
      parseActivityEnv({
        ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
        ACTIVITY_ALLOW_TEST_SEED: 'true',
        NODE_ENV: 'production',
      }),
    ).toThrow(/ACTIVITY_ALLOW_TEST_SEED cannot be enabled in production/);
  });

  it('requires ACTIVITY_REDIS_URL in production when inbound clients are configured', () => {
    expect(() =>
      parseActivityEnv({
        ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
        NODE_ENV: 'production',
        ACTIVITY_INBOUND_CLIENTS_JSON: '[]',
      }),
    ).toThrow(/ACTIVITY_REDIS_URL is required in production/);
  });

  it('requires ACTIVITY_REDIS_URL when ACTIVITY_ENABLED=true', () => {
    expect(() =>
      parseActivityEnv({
        ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
        ACTIVITY_ENABLED: 'true',
        ACTIVITY_AUTHORIZATION_BASE_URL: 'http://127.0.0.1:4300',
        ACTIVITY_AUTHORIZATION_ASSERTION_AUD: 'http://127.0.0.1:4300/authorization/v1',
        ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM:
          '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
        ACTIVITY_TO_AUTHZ_ACTIVE_KID: 'kid-1',
        ACTIVITY_INBOUND_CLIENTS_JSON: '[]',
      }),
    ).toThrow(/ACTIVITY_REDIS_URL/);
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
