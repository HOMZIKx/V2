import { describe, expect, it } from 'vitest';

import type { DraftFormUiState } from './activity-draft-ui-state.js';
import { DraftUiStateCache } from './draft-ui-state-cache.js';

const sampleA: DraftFormUiState = {
  name: 'Azrael',
  description: 'Klucz + 4 DPS',
  scheduleFromDisplay: '20.08.2026 18:00',
  scheduleToDisplay: '',
  whenKind: 'exact',
  source: 'create',
};

const sampleB: DraftFormUiState = {
  ...sampleA,
  name: 'Inny',
};

describe('DraftUiStateCache', () => {
  it('returns a stored presentation state for the same guild, user and draft', () => {
    const cache = new DraftUiStateCache();
    cache.set({ guildId: 'g1', discordUserId: 'u1', opaqueDraftId: 'd1' }, sampleA);
    expect(cache.get({ guildId: 'g1', discordUserId: 'u1', opaqueDraftId: 'd1' })).toEqual(sampleA);
  });

  it('does not let user A read user B state', () => {
    const cache = new DraftUiStateCache();
    cache.set({ guildId: 'g1', discordUserId: 'user-a', opaqueDraftId: 'd1' }, sampleA);
    expect(cache.get({ guildId: 'g1', discordUserId: 'user-b', opaqueDraftId: 'd1' })).toBeNull();
  });

  it('does not let guild A state be read in guild B', () => {
    const cache = new DraftUiStateCache();
    cache.set({ guildId: 'guild-a', discordUserId: 'u1', opaqueDraftId: 'd1' }, sampleA);
    expect(cache.get({ guildId: 'guild-b', discordUserId: 'u1', opaqueDraftId: 'd1' })).toBeNull();
  });

  it('expires entries after TTL', () => {
    let now = 1_000_000;
    const cache = new DraftUiStateCache({ ttlMs: 20 * 60 * 1000, now: () => now });
    cache.set({ guildId: 'g1', discordUserId: 'u1', opaqueDraftId: 'd1' }, sampleA);
    now += 20 * 60 * 1000 - 1;
    expect(cache.get({ guildId: 'g1', discordUserId: 'u1', opaqueDraftId: 'd1' })).toEqual(sampleA);
    now += 2;
    expect(cache.get({ guildId: 'g1', discordUserId: 'u1', opaqueDraftId: 'd1' })).toBeNull();
  });

  it('evicts the oldest entry when the bound is reached', () => {
    const cache = new DraftUiStateCache({ maxEntries: 2 });
    cache.set({ guildId: 'g1', discordUserId: 'u1', opaqueDraftId: 'd1' }, sampleA);
    cache.set({ guildId: 'g1', discordUserId: 'u1', opaqueDraftId: 'd2' }, sampleB);
    cache.set({ guildId: 'g1', discordUserId: 'u1', opaqueDraftId: 'd3' }, sampleB);
    expect(cache.size()).toBe(2);
    expect(cache.get({ guildId: 'g1', discordUserId: 'u1', opaqueDraftId: 'd1' })).toBeNull();
    expect(cache.get({ guildId: 'g1', discordUserId: 'u1', opaqueDraftId: 'd2' })).toEqual(sampleB);
    expect(cache.get({ guildId: 'g1', discordUserId: 'u1', opaqueDraftId: 'd3' })).toEqual(sampleB);
  });

  it('deletes an entry so the next get is a miss', () => {
    const cache = new DraftUiStateCache();
    cache.set({ guildId: 'g1', discordUserId: 'u1', opaqueDraftId: 'd1' }, sampleA);
    cache.delete({ guildId: 'g1', discordUserId: 'u1', opaqueDraftId: 'd1' });
    expect(cache.get({ guildId: 'g1', discordUserId: 'u1', opaqueDraftId: 'd1' })).toBeNull();
  });

  it('does not store secrets', () => {
    const source = DraftUiStateCache.toString();
    expect(source).not.toMatch(/secret|token|hmac|sign/i);
  });
});
