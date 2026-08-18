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

  it('does not treat loopback fallbacks as production OAuth configuration', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://v2-api.zeabur.app');
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_URL', 'http://127.0.0.1:4200');
    vi.stubEnv('NEXT_PUBLIC_WEB_ORIGIN', 'https://v2-web.zeabur.app');
    expect(isLoginConfigured()).toBe(false);
  });
});
