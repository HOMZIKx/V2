import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AuthorizationStorePort } from '../application/ports/authorization.ports.js';
import type { AuthorizationEnv } from '../infrastructure/config/authorization-env.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const config = {
    AUTHORIZATION_ENABLED: false,
  } as AuthorizationEnv;

  it('reports liveness without touching the database', () => {
    const ping = vi.fn();
    const store = { ping } as unknown as AuthorizationStorePort;
    const controller = new HealthController(config, store);

    expect(controller.live()).toMatchObject({ status: 'ok' });
    expect(ping).not.toHaveBeenCalled();
  });

  it('ready skips database when authorization is disabled', async () => {
    const ping = vi.fn();
    const store = { ping } as unknown as AuthorizationStorePort;
    const controller = new HealthController(config, store);

    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      authorizationDisabled: true,
    });
    expect(ping).not.toHaveBeenCalled();
  });

  it('ready checks database and migrations when authorization is enabled', async () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    const hasSchemaMigration = vi.fn().mockResolvedValue(true);
    const countSchemaMigrations = vi.fn().mockResolvedValue(5);
    const store = {
      ping,
      hasSchemaMigration,
      countSchemaMigrations,
    } as unknown as AuthorizationStorePort;
    const enabled = {
      AUTHORIZATION_ENABLED: true,
      AUTHORIZATION_ASSERTION_REDIS_URL: undefined,
    } as AuthorizationEnv;
    const controller = new HealthController(enabled, store);

    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ok',
      checks: { database: true, migrations: true, redis: 'not_configured' },
    });
    expect(ping).toHaveBeenCalledTimes(1);
    expect(hasSchemaMigration).toHaveBeenCalled();
    expect(countSchemaMigrations).toHaveBeenCalledTimes(1);
  });

  it('ready fails when foundation migration is missing', async () => {
    const store = {
      ping: vi.fn().mockResolvedValue(undefined),
      hasSchemaMigration: vi.fn().mockResolvedValue(false),
      countSchemaMigrations: vi.fn().mockResolvedValue(0),
    } as unknown as AuthorizationStorePort;
    const enabled = {
      AUTHORIZATION_ENABLED: true,
      AUTHORIZATION_ASSERTION_REDIS_URL: undefined,
    } as AuthorizationEnv;
    const controller = new HealthController(enabled, store);

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
