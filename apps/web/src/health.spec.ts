import { describe, expect, it } from 'vitest';

import { createHealthPayload } from './health.js';

describe('createHealthPayload', () => {
  it('returns the deployment health contract', () => {
    expect(createHealthPayload()).toEqual({ status: 'ok' });
  });
});
