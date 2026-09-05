import { describe, expect, it } from 'vitest';

import {
  toPlayerIdentityFromSession,
  viewerFromCallbackSearchParams,
} from './identity-auth-client';
import {
  completeDiscordAuth,
  createInitialPlayerStore,
  initialsFromDisplayName,
} from './player-store';

describe('identity session → viewer', () => {
  it('maps Discord snowflake as viewer id when present', () => {
    const viewer = toPlayerIdentityFromSession({
      displayName: 'Mateusz C.',
      v2UserId: '11111111-2222-4333-8444-555555555555',
      discordAccountId: '123456789012345678',
    });
    expect(viewer.id).toBe('123456789012345678');
    expect(viewer.discordAccountId).toBe('123456789012345678');
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

  it('completeDiscordAuth accepts PlayerIdentity from OAuth callback', () => {
    const identity = toPlayerIdentityFromSession({
      displayName: 'Oak Leaf',
      v2UserId: 'v2-1',
      discordAccountId: '111222333',
    });
    const state = completeDiscordAuth(createInitialPlayerStore(), 'authenticated', identity);
    expect(state.viewer).toEqual(identity);
  });

  it('keeps Mateusz demo when completeDiscordAuth has no identity', () => {
    const state = completeDiscordAuth(createInitialPlayerStore(), 'authenticated');
    expect(state.viewer?.id).toBe('mateusz');
    expect(state.viewer?.displayName).toBe('Mateusz');
    expect(initialsFromDisplayName('Mateusz')).toBe('M');
  });
});
