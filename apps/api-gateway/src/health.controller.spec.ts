import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const controller = new HealthController();

  it('reports liveness', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('reports readiness', () => {
    expect(controller.ready()).toEqual({ status: 'ok' });
  });
});
