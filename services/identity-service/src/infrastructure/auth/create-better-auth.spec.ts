import { describe, expect, it } from 'vitest';

import { isSyntheticEmail } from '../../domain/synthetic-email.js';
import { mapDiscordProfileToUser, stripProviderTokens } from './create-better-auth.js';

describe('mapDiscordProfileToUser', () => {
  it('keeps a real Discord email', () => {
    const user = mapDiscordProfileToUser({
      id: '123',
      username: 'user',
      global_name: 'User',
      email: 'real@example.com',
    });
    expect(user.email).toBe('real@example.com');
    expect(user.emailVerified).toBe(false);
    expect(isSyntheticEmail(user.email)).toBe(false);
  });

  it('mints a synthetic email when Discord returns email=null', () => {
    const user = mapDiscordProfileToUser({ id: '123', username: 'user', email: null });
    expect(isSyntheticEmail(user.email)).toBe(true);
    expect(user.name).toBe('user');
    expect(user.emailVerified).toBe(false);
  });

  it('is stable for the same account id', () => {
    const a = mapDiscordProfileToUser({ id: '999', email: null });
    const b = mapDiscordProfileToUser({ id: '999', email: null });
    expect(a.email).toBe(b.email);
  });
});

describe('stripProviderTokens', () => {
  it('nulls all raw provider tokens while keeping other fields', () => {
    const { data } = stripProviderTokens({
      id: 'acc-1',
      providerId: 'discord',
      accessToken: 'secret-access',
      refreshToken: 'secret-refresh',
      idToken: 'secret-id',
      accessTokenExpiresAt: new Date(),
      refreshTokenExpiresAt: new Date(),
    });

    expect(data.providerId).toBe('discord');
    expect(data.accessToken).toBeNull();
    expect(data.refreshToken).toBeNull();
    expect(data.idToken).toBeNull();
    expect(data.accessTokenExpiresAt).toBeNull();
    expect(data.refreshTokenExpiresAt).toBeNull();
  });
});
