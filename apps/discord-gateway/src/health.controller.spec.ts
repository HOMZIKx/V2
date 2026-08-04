import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('reports liveness in safe mode', () => {
    expect(new HealthController().live()).toEqual({ status: 'ok' });
  });
});
