import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const controller = new HealthController(null, null, null);

  it('reports liveness and version identity', () => {
    expect(controller.live()).toMatchObject({ status: 'ok' });
    expect(controller.live().gitCommitSha).toBeDefined();
    expect(controller.version()).toEqual(controller.live());
  });

  it('reports not_configured rather than pretending unconfigured deps are healthy', async () => {
    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ok',
      checks: { activity: 'not_configured', identity: 'not_configured' },
      discord: { state: 'unknown' },
    });
  });
});
