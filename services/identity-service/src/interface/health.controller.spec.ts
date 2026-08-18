import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AuthRuntime } from '../infrastructure/auth/create-better-auth.js';
import type { IdentityEnv } from '../infrastructure/config/identity-env.js';
import { HealthController } from './health.controller.js';

const disabledConfig = { IDENTITY_AUTH_ENABLED: false } as IdentityEnv;
const enabledConfig = { IDENTITY_AUTH_ENABLED: true } as IdentityEnv;

function fakeRuntime(options: { dbOk: boolean; redisOk: boolean; migrated: boolean }): AuthRuntime {
  return {
    pool: {
      query: vi.fn((sql: string) => {
        if (!options.dbOk) {
          return Promise.reject(new Error('db down'));
        }
        if (sql.includes('identity_schema_migrations')) {
          return Promise.resolve({ rowCount: options.migrated ? 1 : 0, rows: [] });
        }
        return Promise.resolve({ rowCount: 1, rows: [{ '?column?': 1 }] });
      }),
    },
    redis: {
      ping: vi.fn().mockResolvedValue(options.redisOk ? 'PONG' : 'NOPE'),
    },
  } as unknown as AuthRuntime;
}

describe('HealthController', () => {
  it('is always live', () => {
    const controller = new HealthController(disabledConfig, null);
    expect(controller.live()).toMatchObject({ status: 'ok' });
  });

  it('reports authDisabled readiness when auth is off', async () => {
    const controller = new HealthController(disabledConfig, null);
    await expect(controller.ready()).resolves.toEqual({ status: 'ok', authDisabled: true });
  });

  it('is ready when db, redis, and migrations are healthy', async () => {
    const controller = new HealthController(
      enabledConfig,
      fakeRuntime({ dbOk: true, redisOk: true, migrated: true }),
    );
    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
  });

  it('is not ready when a dependency is down', async () => {
    const controller = new HealthController(
      enabledConfig,
      fakeRuntime({ dbOk: true, redisOk: false, migrated: true }),
    );
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('is not ready when migrations are missing', async () => {
    const controller = new HealthController(
      enabledConfig,
      fakeRuntime({ dbOk: true, redisOk: true, migrated: false }),
    );
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
