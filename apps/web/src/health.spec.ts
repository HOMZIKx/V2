import { describe, expect, it } from 'vitest';

import { createHealthPayload } from './health';

describe('createHealthPayload', () => {
  it('returns the deployment health contract', () => {
    expect(createHealthPayload()).toMatchObject({ status: 'ok' });
    expect(createHealthPayload().gitCommitSha).toBeDefined();
  });
});
