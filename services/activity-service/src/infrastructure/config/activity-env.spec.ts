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
    expect(env.ACTIVITY_TO_AUTHZ_CLIENT_ID).toBe('v2.activity-service');
    expect(env.ACTIVITY_TO_DISCORD_CLIENT_ID).toBe('v2.activity-service');
    expect(env.ACTIVITY_OUTBOX_TRANSPORT).toBe('http');
  });

  it('defaults transport to rabbitmq when RABBITMQ_URL is set', () => {
    const env = parseActivityEnv({
      ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
      RABBITMQ_URL: 'amqp://v2:pass@localhost:5672',
    });
    expect(env.ACTIVITY_OUTBOX_TRANSPORT).toBe('rabbitmq');
  });

  it('honors explicit ACTIVITY_OUTBOX_TRANSPORT=http even with RABBITMQ_URL', () => {
    const env = parseActivityEnv({
      ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
      RABBITMQ_URL: 'amqp://v2:pass@localhost:5672',
      ACTIVITY_OUTBOX_TRANSPORT: 'http',
    });
    expect(env.ACTIVITY_OUTBOX_TRANSPORT).toBe('http');
  });

  it('requires Discord projection base URL when outbox worker uses http', () => {
    expect(() =>
      parseActivityEnv({
        ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
        ACTIVITY_OUTBOX_WORKER_ENABLED: 'true',
        ACTIVITY_OUTBOX_TRANSPORT: 'http',
      }),
    ).toThrow(/ACTIVITY_DISCORD_PROJECTION_BASE_URL/);
  });

  it('requires RABBITMQ_URL when outbox worker uses rabbitmq', () => {
    expect(() =>
      parseActivityEnv({
        ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
        ACTIVITY_OUTBOX_WORKER_ENABLED: 'true',
        ACTIVITY_OUTBOX_TRANSPORT: 'rabbitmq',
      }),
    ).toThrow(/RABBITMQ_URL/);
  });

  it('accepts rabbitmq worker with RABBITMQ_URL and without HTTP projection URL', () => {
    const env = parseActivityEnv({
      ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
      ACTIVITY_OUTBOX_WORKER_ENABLED: 'true',
      ACTIVITY_OUTBOX_TRANSPORT: 'rabbitmq',
      RABBITMQ_URL: 'amqp://v2:pass@localhost:5672',
    });
    expect(env.ACTIVITY_OUTBOX_TRANSPORT).toBe('rabbitmq');
    expect(env.ACTIVITY_DISCORD_PROJECTION_BASE_URL).toBeUndefined();
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
