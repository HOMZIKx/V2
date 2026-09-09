import { describe, expect, it } from 'vitest';

import { isSyntheticEmail } from '../../domain/synthetic-email.js';
import {
  buildDiscordAvatarUrl,
  mapDiscordProfileToUser,
  stripProviderTokens,
} from './create-better-auth.js';

describe('mapDiscordProfileToUser', () => {
  it('keeps a real Discord email and maps a custom avatar', () => {
    const user = mapDiscordProfileToUser({
      id: '123456789012345678',
      username: 'user',
      global_name: 'User',
      email: 'real@example.com',
      avatar: 'abc123',
    });
    expect(user.email).toBe('real@example.com');
    expect(user.emailVerified).toBe(false);
    expect(user.image).toBe(
      'https://cdn.discordapp.com/avatars/123456789012345678/abc123.png?size=128',
    );
    expect(isSyntheticEmail(user.email)).toBe(false);
  });

  it('uses gif for an animated Discord avatar', () => {
    expect(
      buildDiscordAvatarUrl({ id: '123456789012345678', avatar: 'a_animatedhash' }),
    ).toBe(
      'https://cdn.discordapp.com/avatars/123456789012345678/a_animatedhash.gif?size=128',
    );
  });

  it('uses the legacy discriminator default avatar when there is no custom avatar', () => {
    expect(
      buildDiscordAvatarUrl({ id: '123', avatar: null, discriminator: '1234' }),
    ).toBe('https://cdn.discordapp.com/embed/avatars/4.png');
  });

  it('uses the migrated-account default avatar when discriminator is zero', () => {
    const id = '175928847299117063';
    const expected = Number((BigInt(id) >> 22n) % 6n);
    expect(buildDiscordAvatarUrl({ id, avatar: null, discriminator: '0' })).toBe(
      `https://cdn.discordapp.com/embed/avatars/${expected}.png`,
    );
  });

  it('mints a synthetic email when Discord returns email=null', () => {
    const user = mapDiscordProfileToUser({ id: '123', username: 'user', email: null });
    expect(isSyntheticEmail(user.email)).toBe(true);
    expect(user.name).toBe('user');
    expect(user.emailVerified).toBe(false);
    expect(user.image).toMatch(/^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/u);
  });

  it('is stable for the same account id', () => {
    const a = mapDiscordProfileToUser({ id: '999', email: null });
    const b = mapDiscordProfileToUser({ id: '999', email: null });
    expect(a.email).toBe(b.email);
    expect(a.image).toBe(b.image);
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
