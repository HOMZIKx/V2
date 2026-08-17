import { afterEach, describe, expect, it, vi } from 'vitest';

import { isLoginConfigured } from './env';

describe('isLoginConfigured', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('treats a normal identity URL as configured', () => {
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_URL', 'http://127.0.0.1:4200');
    expect(isLoginConfigured()).toBe(true);
  });

  it('treats unavailable identity as login down', () => {
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_URL', 'unavailable');
    expect(isLoginConfigured()).toBe(false);
  });
});
