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

    expect(controller.live()).toEqual({ status: 'ok' });
    expect(ping).not.toHaveBeenCalled();
  });

  it('ready checks database with SELECT 1 via store.ping', async () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    const store = { ping } as unknown as AuthorizationStorePort;
    const controller = new HealthController(config, store);

    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      authorizationDisabled: true,
    });
    expect(ping).toHaveBeenCalledTimes(1);
  });
});
