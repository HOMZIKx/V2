import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ActivityRepositoryPort } from '../application/ports/activity.ports.js';
import type { ActivityEnv } from '../infrastructure/config/activity-env.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const config = {
    ACTIVITY_ENABLED: true,
  } as ActivityEnv;

  it('live does not touch dependencies', () => {
    const ping = vi.fn();
    const repository = { ping } as unknown as ActivityRepositoryPort;
    const controller = new HealthController(config, repository, null);
    expect(controller.live()).toMatchObject({ status: 'ok' });
    expect(controller.version()).toEqual(controller.live());
    expect(ping).not.toHaveBeenCalled();
  });

  it('ready fails when the database ping fails', async () => {
    const repository = {
      ping: vi.fn().mockRejectedValue(new Error('db down')),
    } as unknown as ActivityRepositoryPort;
    const controller = new HealthController(config, repository, null);
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('ready includes outbox operator state when the repository provides it', async () => {
    const repository = {
      ping: vi.fn().mockResolvedValue(undefined),
      hasSchemaMigration: vi.fn().mockResolvedValue(true),
      countSchemaMigrations: vi.fn().mockResolvedValue(19),
      countOutboxByStatus: vi.fn().mockResolvedValue({
        pending: 0,
        claimed: 0,
        failed: 0,
        delivered: 3,
        retrying: 0,
        state: 'idle',
      }),
    } as unknown as ActivityRepositoryPort;
    const controller = new HealthController(config, repository, null);
    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ok',
      checks: { database: true, redis: 'not_configured', migrations: true },
      outbox: { state: 'idle' },
    });
  });

  it('ready fails when foundation migration is missing', async () => {
    const repository = {
      ping: vi.fn().mockResolvedValue(undefined),
      hasSchemaMigration: vi.fn().mockResolvedValue(false),
      countSchemaMigrations: vi.fn().mockResolvedValue(0),
    } as unknown as ActivityRepositoryPort;
    const controller = new HealthController(config, repository, null);
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
