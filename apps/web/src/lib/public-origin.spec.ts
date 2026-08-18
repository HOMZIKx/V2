import { describe, expect, it } from 'vitest';

import { isLoginConfiguredFromOrigins } from './env';
import { evaluatePublicOrigin, isLoopbackHostname, readPublicOrigin } from './public-origin';

describe('public origin contract', () => {
  it('flags loopback hosts', () => {
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('::1')).toBe(true);
    expect(isLoopbackHostname('[::1]')).toBe(true);
    expect(isLoopbackHostname('v2-web.zeabur.app')).toBe(false);
  });

  it('accepts public https origins', () => {
    expect(evaluatePublicOrigin('https://v2-api.zeabur.app', { requireHttps: true })).toEqual({
      ok: true,
      reason: 'ok',
      origin: 'https://v2-api.zeabur.app',
    });
  });

  it('rejects missing, malformed, loopback and insecure production origins', () => {
    expect(evaluatePublicOrigin(undefined, { requireHttps: true }).reason).toBe('missing');
    expect(evaluatePublicOrigin('not-a-url', { requireHttps: true }).reason).toBe('malformed');
    expect(evaluatePublicOrigin('http://127.0.0.1:4200', { requireHttps: true }).reason).toBe(
      'loopback',
    );
    expect(evaluatePublicOrigin('https://localhost:3000', { requireHttps: true }).reason).toBe(
      'loopback',
    );
    expect(evaluatePublicOrigin('http://v2-web.zeabur.app', { requireHttps: true }).reason).toBe(
      'insecure',
    );
  });

  it('keeps local fallbacks outside production', () => {
    expect(readPublicOrigin(undefined, 'http://127.0.0.1:4000', 'test')).toBe(
      'http://127.0.0.1:4000',
    );
  });

  it('does not fall back to loopback in production', () => {
    expect(readPublicOrigin(undefined, 'http://127.0.0.1:4000', 'production')).toBe('');
    expect(readPublicOrigin('http://127.0.0.1:4200', 'http://127.0.0.1:4200', 'production')).toBe(
      '',
    );
  });
});

describe('isLoginConfiguredFromOrigins', () => {
  it('treats valid production origins as configured', () => {
    expect(
      isLoginConfiguredFromOrigins(
        {
          api: 'https://v2-api.zeabur.app',
          identity: 'https://v2-api.zeabur.app',
          web: 'https://v2-web.zeabur.app',
        },
        'production',
      ),
    ).toBe(true);
  });

  it('rejects missing or loopback identity in production', () => {
    expect(
      isLoginConfiguredFromOrigins(
        {
          api: 'https://v2-api.zeabur.app',
          identity: '',
          web: 'https://v2-web.zeabur.app',
        },
        'production',
      ),
    ).toBe(false);
    expect(
      isLoginConfiguredFromOrigins(
        {
          api: 'https://v2-api.zeabur.app',
          identity: 'http://127.0.0.1:4200',
          web: 'https://v2-web.zeabur.app',
        },
        'production',
      ),
    ).toBe(false);
    expect(
      isLoginConfiguredFromOrigins(
        {
          api: 'https://v2-api.zeabur.app',
          identity: 'http://localhost:4200',
          web: 'https://v2-web.zeabur.app',
        },
        'production',
      ),
    ).toBe(false);
  });

  it('rejects missing or loopback web origin in production', () => {
    expect(
      isLoginConfiguredFromOrigins(
        {
          api: 'https://v2-api.zeabur.app',
          identity: 'https://v2-api.zeabur.app',
          web: '',
        },
        'production',
      ),
    ).toBe(false);
    expect(
      isLoginConfiguredFromOrigins(
        {
          api: 'https://v2-api.zeabur.app',
          identity: 'https://v2-api.zeabur.app',
          web: 'http://127.0.0.1:3000',
        },
        'production',
      ),
    ).toBe(false);
  });
});
