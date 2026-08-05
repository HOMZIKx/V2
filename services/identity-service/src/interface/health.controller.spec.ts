import { describe, expect, it } from 'vitest';

import type { IdentityEnv } from '../infrastructure/config/identity-env.js';
import { HealthController } from './health.controller.js';

const disabledConfig = { IDENTITY_AUTH_ENABLED: false } as IdentityEnv;

describe('HealthController', () => {
  it('is always live', () => {
    const controller = new HealthController(disabledConfig, null);
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('reports authDisabled readiness when auth is off', async () => {
    const controller = new HealthController(disabledConfig, null);
    await expect(controller.ready()).resolves.toEqual({ status: 'ok', authDisabled: true });
  });
});
