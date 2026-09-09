import { describe, expect, it } from 'vitest';

import {
  callbackClaimsMatchResolvedSession,
  toPlayerIdentityFromSession,
  viewerFromCallbackSearchParams,
} from './identity-auth-client';
import {
  completeDiscordAuth,
  createInitialPlayerStore,
  initialsFromDisplayName,
} from './player-store';

describe('identity session → viewer', () => {
  it('maps Discord snowflake and avatar when present', () => {
    const viewer = toPlayerIdentityFromSession({
      displayName: 'Mateusz C.',
      v2UserId: '11111111-2222-4333-8444-555555555555',
      discordAccountId: '123456789012345678',
      discordAvatarUrl:
        'https://cdn.discordapp.com/avatars/123456789012345678/avatar.png?size=128',
    });
    expect(viewer.id).toBe('123456789012345678');
    expect(viewer.discordAccountId).toBe('123456789012345678');
    expect(viewer.discordAvatarUrl).toBe(
      'https://cdn.discordapp.com/avatars/123456789012345678/avatar.png?size=128',
    );
    expect(viewer.displayName).toBe('Mateusz C.');
    expect(viewer.initials).toBe('MC');
  });

  it('falls back to V2 uuid without Discord account', () => {
    const viewer = toPlayerIdentityFromSession({
      displayName: 'Solo',
      v2UserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });
    expect(viewer.id).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(viewer.discordAccountId).toBeUndefined();
    expect(viewer.discordAvatarUrl).toBeUndefined();
  });

  it('parses auth callback query params (bridge)', () => {
    const params = new URLSearchParams({
      viewerId: 'uuid-1',
      displayName: 'Destiled',
      discordAccountId: '999',
    });
    const viewer = viewerFromCallbackSearchParams(params);
    expect(viewer?.id).toBe('999');
    expect(viewer?.discordAccountId).toBe('999');
  });

  it('accepts callback ids only when they agree with the live Identity session', () => {
    const viewer = toPlayerIdentityFromSession({
      displayName: 'Destiled',
      v2UserId: 'uuid-1',
      discordAccountId: '999999999999999999',
    });
    const resolved = {
      viewer,
      v2UserId: 'uuid-1',
      discordAccountId: '999999999999999999',
    };

    expect(
      callbackClaimsMatchResolvedSession(
        new URLSearchParams({
          viewerId: 'uuid-1',
          displayName: 'anything',
          discordAccountId: '999999999999999999',
        }),
        resolved,
      ),
    ).toBe(true);
  });

  it('rejects forged callback ids even when the URL otherwise looks valid', () => {
    const viewer = toPlayerIdentityFromSession({
      displayName: 'Destiled',
      v2UserId: 'uuid-real',
      discordAccountId: '999999999999999999',
    });
    const resolved = {
      viewer,
      v2UserId: 'uuid-real',
      discordAccountId: '999999999999999999',
    };

    expect(
      callbackClaimsMatchResolvedSession(
        new URLSearchParams({
          viewerId: 'uuid-attacker',
          displayName: 'Forged',
          discordAccountId: '111111111111111111',
        }),
        resolved,
      ),
    ).toBe(false);
  });

  it('completeDiscordAuth keeps the avatar-bearing identity object', () => {
    const identity = toPlayerIdentityFromSession({
      displayName: 'Oak Leaf',
      v2UserId: 'v2-1',
      discordAccountId: '111222333',
      discordAvatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png',
    });
    const state = completeDiscordAuth(createInitialPlayerStore(), 'authenticated', identity);
    expect(state.viewer).toEqual(identity);
    expect((state.viewer as { discordAvatarUrl?: string } | null)?.discordAvatarUrl).toBe(
      'https://cdn.discordapp.com/embed/avatars/1.png',
    );
  });

  it('keeps Mateusz demo when completeDiscordAuth has no identity', () => {
    const state = completeDiscordAuth(createInitialPlayerStore(), 'authenticated');
    expect(state.viewer?.id).toBe('mateusz');
    expect(state.viewer?.displayName).toBe('Mateusz');
    expect(initialsFromDisplayName('Mateusz')).toBe('M');
  });
});
