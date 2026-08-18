import { describe, expect, it } from 'vitest';

import { resolveSessionCookieAttributes } from './session-cookie-attributes.js';

describe('resolveSessionCookieAttributes', () => {
  it('keeps Lax on local same-host origins', () => {
    expect(
      resolveSessionCookieAttributes({
        authBaseUrl: 'http://127.0.0.1:4200',
        trustedOrigins: ['http://127.0.0.1:3000', 'http://127.0.0.1:3001'],
      }),
    ).toEqual({ sameSite: 'lax', secure: false });
  });

  it('uses None+Secure when WWW/Admin hosts differ from the HTTPS API host', () => {
    expect(
      resolveSessionCookieAttributes({
        authBaseUrl: 'https://v2-api.zeabur.app',
        trustedOrigins: ['https://v2-web.zeabur.app', 'https://v2-admin.zeabur.app'],
      }),
    ).toEqual({ sameSite: 'none', secure: true });
  });

  it('does not emit None on HTTP even when hosts differ', () => {
    expect(
      resolveSessionCookieAttributes({
        authBaseUrl: 'http://identity.local:4200',
        trustedOrigins: ['http://web.local:3000'],
      }),
    ).toEqual({ sameSite: 'lax', secure: false });
  });

  it('defaults to Lax when the auth base URL is missing', () => {
    expect(
      resolveSessionCookieAttributes({
        authBaseUrl: undefined,
        trustedOrigins: ['https://v2-web.zeabur.app'],
      }),
    ).toEqual({ sameSite: 'lax', secure: false });
  });
});
