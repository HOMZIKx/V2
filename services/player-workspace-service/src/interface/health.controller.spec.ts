import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('reports liveness without database', () => {
    const controller = new HealthController({
      query: () => Promise.reject(new Error('unused')),
    } as never);
    expect(controller.live()).toEqual({ status: 'ok' });
  });
});
