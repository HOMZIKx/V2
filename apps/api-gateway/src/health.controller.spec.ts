import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const controller = new HealthController();

  it('reports liveness', () => {
    expect(controller.live()).toMatchObject({ status: 'ok' });
    expect(controller.live().gitCommitSha).toBeDefined();
  });

  it('reports readiness', () => {
    expect(controller.ready()).toMatchObject({ status: 'ok' });
  });
});
