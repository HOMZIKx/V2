import { describe, expect, it } from 'vitest';

import { buildAdminDiscordLoginUrl, shouldOfferIdentityLogin } from './login.js';

describe('buildAdminDiscordLoginUrl', () => {
  it('starts OAuth on the public API origin with Admin callback', () => {
    const url = buildAdminDiscordLoginUrl(
      'https://v2-admin.zeabur.app',
      'https://v2-api.zeabur.app',
    );
    expect(url).toBe(
      'https://v2-api.zeabur.app/identity/oauth/discord?callbackURL=' +
        encodeURIComponent('https://v2-admin.zeabur.app/'),
    );
  });

  it('does not offer Identity login in local DEV actor mode', () => {
    expect(shouldOfferIdentityLogin('dev-actor')).toBe(false);
    expect(shouldOfferIdentityLogin('identity-cookie')).toBe(true);
  });
});
