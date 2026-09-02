import { describe, expect, it } from 'vitest';

import { type CallbackUrlPolicy, isAllowedCallbackUrl } from './callback-url.js';

const baseConfig: CallbackUrlPolicy = {
  NODE_ENV: 'development',
  IDENTITY_AUTH_BASE_URL: 'http://127.0.0.1:4200',
  IDENTITY_TRUSTED_ORIGINS: ['http://localhost:3000', 'http://127.0.0.1:3000'],
};

describe('isAllowedCallbackUrl', () => {
  it('allows callbacks under the auth base origin', () => {
    expect(isAllowedCallbackUrl('http://127.0.0.1:4200/identity/proof', baseConfig)).toBe(true);
  });

  it('allows callbacks under a trusted origin', () => {
    expect(isAllowedCallbackUrl('http://localhost:3000/app', baseConfig)).toBe(true);
  });

  it('rejects a foreign origin', () => {
    expect(isAllowedCallbackUrl('https://evil.example/steal', baseConfig)).toBe(false);
  });

  it('rejects non-http(s) schemes', () => {
    expect(isAllowedCallbackUrl('javascript:alert(1)', baseConfig)).toBe(false);
  });

  it('rejects http and localhost in production', () => {
    const production: CallbackUrlPolicy = {
      ...baseConfig,
      NODE_ENV: 'production',
      IDENTITY_AUTH_BASE_URL: 'https://identity.example',
      IDENTITY_TRUSTED_ORIGINS: ['https://app.example'],
    };

    expect(isAllowedCallbackUrl('http://app.example/cb', production)).toBe(false);
    expect(isAllowedCallbackUrl('https://localhost/cb', production)).toBe(false);
    expect(isAllowedCallbackUrl('https://127.0.0.1/cb', production)).toBe(false);
    expect(isAllowedCallbackUrl('javascript:alert(1)', production)).toBe(false);
    expect(isAllowedCallbackUrl('not a url', production)).toBe(false);
    expect(isAllowedCallbackUrl('https://evil.example/cb', production)).toBe(false);
    expect(isAllowedCallbackUrl('https://app.example/cb', production)).toBe(true);
  });
});
