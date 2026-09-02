import { describe, expect, it } from 'vitest';

import { serviceName } from './service-name.js';

describe('serviceName', () => {
  it('identifies the bounded service', () => {
    expect(serviceName).toBe('player-workspace-service');
  });
});
