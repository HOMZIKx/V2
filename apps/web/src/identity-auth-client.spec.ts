import { describe, expect, it } from 'vitest';

import { toPlayerIdentityFromSession } from './identity-auth-client';
import { completeDiscordAuth, createInitialPlayerStore } from './player-store';

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

  it('completeDiscordAuth accepts PlayerIdentity from OAuth callback', () => {
    const identity = toPlayerIdentityFromSession({
      displayName: 'Oak Leaf',
      v2UserId: 'v2-1',
      discordAccountId: '111222333',
    });
    const state = completeDiscordAuth(createInitialPlayerStore(), 'authenticated', identity);
    expect(state.viewer).toEqual(identity);
  });

  it('refuses authenticated transition without a verified identity', () => {
    const initial = createInitialPlayerStore();
    const state = completeDiscordAuth(initial, 'authenticated');
    expect(state).toBe(initial);
    expect(state.authStatus).not.toBe('authenticated');
    expect(state.viewer).toBeNull();
  });

  it('refuses authenticated transition without a stable identity id', () => {
    const initial = createInitialPlayerStore();
    const state = completeDiscordAuth(initial, 'authenticated', { displayName: 'Fake' });
    expect(state).toBe(initial);
    expect(state.authStatus).not.toBe('authenticated');
    expect(state.viewer).toBeNull();
  });
});
