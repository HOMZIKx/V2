import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('reports liveness and readiness without a database connection', () => {
    const controller = new HealthController();

    expect(controller.live()).toEqual({ status: 'ok' });
    expect(controller.ready()).toEqual({ status: 'ok' });
  });
});
