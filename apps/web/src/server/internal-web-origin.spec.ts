import { afterEach, describe, expect, it, vi } from 'vitest';

import { internalWebOrigin, internalWebUrl } from './internal-web-origin';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('internalWebOrigin', () => {
  it('uses the request origin outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('WEB_INTERNAL_ORIGIN', '');

    expect(internalWebOrigin('http://localhost:3000/example')).toBe('http://localhost:3000');
  });

  it('uses loopback and the runtime PORT in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WEB_INTERNAL_ORIGIN', '');
    vi.stubEnv('PORT', '8080');

    expect(internalWebOrigin('https://destiled.example/example')).toBe('http://127.0.0.1:8080');
    expect(internalWebUrl('https://destiled.example/example', '/player-team/v1/me/state').toString()).toBe(
      'http://127.0.0.1:8080/player-team/v1/me/state',
    );
  });

  it('supports an explicit internal origin override', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WEB_INTERNAL_ORIGIN', 'http://web.zeabur.internal:3000/');

    expect(internalWebOrigin('https://destiled.example/example')).toBe('http://web.zeabur.internal:3000');
  });

  it('ignores an invalid runtime port and falls back safely', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WEB_INTERNAL_ORIGIN', '');
    vi.stubEnv('PORT', '99999');
    vi.stubEnv('WEB_PORT', '3000');

    expect(internalWebOrigin('https://destiled.example/example')).toBe('http://127.0.0.1:3000');
  });
});
