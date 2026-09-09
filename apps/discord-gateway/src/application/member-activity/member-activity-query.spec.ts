import { describe, expect, it } from 'vitest';

import type { MemberActivityConfig } from '../technika/capabilities.js';
import {
  MemberActivityQuery,
  parseActivityWindow,
  resolveWindowRange,
} from './member-activity-query.js';
import type { MemberActivityStore } from './member-activity-store.js';

function config(overrides: Partial<MemberActivityConfig> = {}): MemberActivityConfig {
  return {
    enabled: true,
    guildId: 'guild-a',
    memberRoleIds: [],
    windowDays: 7,
    topN: 2,
    ...overrides,
  };
}

describe('member activity query', () => {
  it('resolves 7d, 14d, 30d and since_bot ranges inclusively', () => {
    const store = {
      dayKey: (date?: Date) => (date ? '2026-09-01' : '2026-09-08'),
      getCollectorStartedAt: () => '2026-09-01T10:00:00.000Z',
    } as unknown as MemberActivityStore;

    expect(resolveWindowRange(store, '7d')).toEqual({
      fromDayInclusive: '2026-09-02',
      toDayInclusive: '2026-09-08',
      window: '7d',
    });
    expect(resolveWindowRange(store, '14d')).toEqual({
      fromDayInclusive: '2026-08-26',
      toDayInclusive: '2026-09-08',
      window: '14d',
    });
    expect(resolveWindowRange(store, '30d')).toEqual({
      fromDayInclusive: '2026-08-10',
      toDayInclusive: '2026-09-08',
      window: '30d',
    });
    expect(resolveWindowRange(store, 'since_bot')).toEqual({
      fromDayInclusive: '2026-09-01',
      toDayInclusive: '2026-09-08',
      window: 'since_bot',
    });
  });

  it('falls back to the configured window when the requested window is invalid', () => {
    expect(parseActivityWindow('7d', '14d')).toBe('7d');
    expect(parseActivityWindow('since_bot', '14d')).toBe('since_bot');
    expect(parseActivityWindow('invalid', '14d')).toBe('14d');
    expect(parseActivityWindow(undefined, '30d')).toBe('30d');
  });

  it('aggregates score and applies stable ranking tie-breaks before topN', () => {
    const aggregate = new Map([
      ['user-a', { messageCount: 5, voiceMinutes: 5, displayName: 'Alice' }],
      ['user-b', { messageCount: 6, voiceMinutes: 4, displayName: 'Bob' }],
      ['user-c', { messageCount: 1, voiceMinutes: 20, displayName: 'Carol' }],
      ['user-d', { messageCount: 0, voiceMinutes: 0, displayName: 'Dave' }],
    ]);
    const store = {
      dayKey: () => '2026-09-08',
      getCollectorStartedAt: () => '2026-09-01T10:00:00.000Z',
      aggregate: () => aggregate,
    } as unknown as MemberActivityStore;
    const query = new MemberActivityQuery(store, () => config());

    const result = query.ranking({ window: '7d' });

    expect(result.totalMembers).toBe(4);
    expect(result.entries).toEqual([
      {
        rank: 1,
        discordUserId: 'user-c',
        displayName: 'Carol',
        messageCount: 1,
        voiceMinutes: 20,
        score: 21,
      },
      {
        rank: 2,
        discordUserId: 'user-b',
        displayName: 'Bob',
        messageCount: 6,
        voiceMinutes: 4,
        score: 10,
      },
    ]);
  });

  it('searches the full aggregate before limiting and keeps /me rank consistent', () => {
    const aggregate = new Map([
      ['100', { messageCount: 10, voiceMinutes: 0, displayName: 'Alpha' }],
      ['200', { messageCount: 5, voiceMinutes: 4, displayName: 'Beta' }],
      ['300', { messageCount: 1, voiceMinutes: 7, displayName: 'Gamma Hunter' }],
    ]);
    const store = {
      dayKey: () => '2026-09-08',
      getCollectorStartedAt: () => '2026-09-01T10:00:00.000Z',
      aggregate: () => aggregate,
    } as unknown as MemberActivityStore;
    const query = new MemberActivityQuery(store, () => config({ topN: 2 }));

    const filtered = query.ranking({ q: 'gamma', topN: 1 });
    expect(filtered.totalMembers).toBe(1);
    expect(filtered.entries[0]?.discordUserId).toBe('300');
    expect(filtered.entries[0]?.rank).toBe(1);

    const me = query.me({ discordUserId: '300', window: '7d' });
    expect(me.self?.rank).toBe(3);
    expect(me.self?.score).toBe(8);
    expect(me.top.map((entry) => entry.discordUserId)).toEqual(['100', '200']);
  });
});
