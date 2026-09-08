import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Message, VoiceState } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MemberActivityConfig } from '../technika/capabilities.js';
import { MemberActivityCollector } from './member-activity-collector.js';
import { MemberActivityQuery } from './member-activity-query.js';
import { MemberActivityStore } from './member-activity-store.js';

const GUILD_ID = '1543972927719080016';
const USER_ID = '111111111111111111';
const OTHER_GUILD_ID = '1531318787058696424';
const AVATAR_URL = 'https://cdn.discordapp.com/avatars/111111111111111111/avatar-a.webp';
const OTHER_AVATAR_URL = 'https://cdn.discordapp.com/avatars/111111111111111111/avatar-b.webp';

const tempDirs: string[] = [];

function createStore(): MemberActivityStore {
  const dir = mkdtempSync(path.join(tmpdir(), 'v2-member-activity-'));
  tempDirs.push(dir);
  return new MemberActivityStore(dir);
}

function state(input?: {
  guildId?: string;
  channelId?: string | null;
  channelName?: string;
  afkChannelId?: string | null;
  bot?: boolean;
  userId?: string;
  avatarUrl?: string;
}): VoiceState {
  const channelId = input?.channelId === undefined ? '222222222222222222' : input.channelId;
  const userId = input?.userId ?? USER_ID;
  const avatarUrl = input?.avatarUrl ?? AVATAR_URL;
  return {
    guild: {
      id: input?.guildId ?? GUILD_ID,
      afkChannelId: input?.afkChannelId ?? null,
    },
    channelId,
    channel: channelId === null ? null : { name: input?.channelName ?? 'Głosowy' },
    member: {
      id: userId,
      displayName: 'Tester',
      user: {
        bot: input?.bot ?? false,
        username: 'tester',
        displayAvatarURL: () => avatarUrl,
      },
      roles: { cache: new Map() },
    },
  } as unknown as VoiceState;
}

function message(input?: {
  guildId?: string;
  userId?: string;
  bot?: boolean;
  displayName?: string;
  avatarUrl?: string;
}): Message {
  const userId = input?.userId ?? USER_ID;
  const displayName = input?.displayName ?? 'Tester';
  const avatarUrl = input?.avatarUrl ?? AVATAR_URL;
  return {
    guildId: input?.guildId ?? GUILD_ID,
    author: {
      id: userId,
      bot: input?.bot ?? false,
      username: displayName,
      displayAvatarURL: () => avatarUrl,
    },
    member: {
      id: userId,
      displayName,
      roles: { cache: new Map() },
    },
  } as unknown as Message;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('MemberActivityCollector voice restart recovery', () => {
  it('seeds an already-connected member after restart and counts from recovery time once', () => {
    const store = createStore();
    const cfg: MemberActivityConfig = {
      enabled: true,
      guildId: GUILD_ID,
      memberRoleIds: [],
      windowDays: 7,
      topN: 10,
    };
    let now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const collector = new MemberActivityCollector(store, () => cfg);
    const current = state();

    expect(collector.seedCurrentVoiceStates([current])).toBe(1);
    expect(collector.seedCurrentVoiceStates([current])).toBe(0);

    now += 2 * 60_000;
    collector.flushAllOpenSessions();

    const bucket = store.readDay(GUILD_ID, store.dayKey())[USER_ID];
    expect(bucket?.voiceMinutes).toBe(2);
    expect(bucket?.displayName).toBe('Tester');
    expect(bucket?.avatarUrl).toBe(AVATAR_URL);
  });

  it('does not seed AFK, bot, disconnected, or an unknown guild voice state', () => {
    const store = createStore();
    const cfg: MemberActivityConfig = {
      enabled: true,
      guildId: GUILD_ID,
      memberRoleIds: [],
      windowDays: 7,
      topN: 10,
    };
    const collector = new MemberActivityCollector(store, () => cfg);
    const afkChannelId = '333333333333333333';

    expect(
      collector.seedCurrentVoiceStates([
        state({ channelId: afkChannelId, afkChannelId }),
        state({ bot: true, userId: '444444444444444444' }),
        state({ channelId: null, userId: '555555555555555555' }),
        state({ guildId: '1999999999999999999', userId: '666666666666666666' }),
      ]),
    ).toBe(0);
  });

  it('collects Destiled and Sojusz concurrently while keeping the same user isolated per guild', () => {
    const store = createStore();
    const cfg: MemberActivityConfig = {
      enabled: true,
      guildId: GUILD_ID,
      memberRoleIds: [],
      windowDays: 7,
      topN: 10,
    };
    let now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const collector = new MemberActivityCollector(store, () => cfg);

    collector.handleMessageCreate(message({ guildId: GUILD_ID, avatarUrl: AVATAR_URL }));
    collector.handleMessageCreate(message({ guildId: OTHER_GUILD_ID, avatarUrl: OTHER_AVATAR_URL }));
    collector.handleMessageCreate(message({ guildId: OTHER_GUILD_ID, avatarUrl: OTHER_AVATAR_URL }));

    expect(
      collector.seedCurrentVoiceStates([
        state({ guildId: GUILD_ID, avatarUrl: AVATAR_URL }),
        state({ guildId: OTHER_GUILD_ID, avatarUrl: OTHER_AVATAR_URL }),
      ]),
    ).toBe(2);

    now += 2 * 60_000;
    collector.flushAllOpenSessions();

    const query = new MemberActivityQuery(store, () => cfg);
    const destiled = query.ranking({ guildId: GUILD_ID, window: '7d', full: true });
    const sojusz = query.ranking({ guildId: OTHER_GUILD_ID, window: '7d', full: true });

    expect(destiled.entries).toHaveLength(1);
    expect(destiled.entries[0]).toMatchObject({
      discordUserId: USER_ID,
      avatarUrl: AVATAR_URL,
      messageCount: 1,
      voiceMinutes: 2,
      score: 3,
    });
    expect(sojusz.entries).toHaveLength(1);
    expect(sojusz.entries[0]).toMatchObject({
      discordUserId: USER_ID,
      avatarUrl: OTHER_AVATAR_URL,
      messageCount: 2,
      voiceMinutes: 2,
      score: 4,
    });
  });

  it('stops stale open sessions when activity collection is disabled', () => {
    const store = createStore();
    let cfg: MemberActivityConfig = {
      enabled: true,
      guildId: GUILD_ID,
      memberRoleIds: [],
      windowDays: 7,
      topN: 10,
    };
    let now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const collector = new MemberActivityCollector(store, () => cfg);

    expect(collector.seedCurrentVoiceStates([state()])).toBe(1);
    cfg = { ...cfg, enabled: false };
    now += 5 * 60_000;
    collector.flushAllOpenSessions();

    expect(store.readDay(GUILD_ID, store.dayKey())[USER_ID]).toBeUndefined();
  });
});
