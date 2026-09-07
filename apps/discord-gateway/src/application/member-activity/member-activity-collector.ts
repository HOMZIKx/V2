/** Live Discord → daily buckets collector (MessageCreate + voice minutes). */

import type { GuildMember, Message, VoiceState } from 'discord.js';

import type { MemberActivityConfig } from '../technika/capabilities.js';
import { MemberActivityStore } from './member-activity-store.js';

type VoiceSession = {
  readonly joinedAtMs: number;
  readonly displayName?: string | undefined;
};

const LIVE_VOICE_FLUSH_MS = 60_000;

function isAfkVoiceState(state: VoiceState): boolean {
  if (state.channelId === null) return false;

  // Discord's configured AFK channel is always excluded.
  if (state.guild.afkChannelId && state.channelId === state.guild.afkChannelId) {
    return true;
  }

  // Also exclude explicitly named AFK voice channels (e.g. "AFK", "💤・AFK").
  const channelName = state.channel?.name ?? '';
  return /(^|[^a-z0-9])afk([^a-z0-9]|$)/i.test(channelName);
}

export class MemberActivityCollector {
  private readonly voiceJoined = new Map<string, VoiceSession>();
  private readonly liveFlushTimer: ReturnType<typeof setInterval>;

  public constructor(
    private readonly store: MemberActivityStore,
    private readonly getConfig: () => MemberActivityConfig,
  ) {
    // Keep the dashboard current even while a user remains on VC for hours.
    // Advancing sessions by full persisted minutes preserves the sub-minute
    // remainder instead of discarding it on every periodic flush.
    this.liveFlushTimer = setInterval(() => {
      this.flushAllOpenSessions();
    }, LIVE_VOICE_FLUSH_MS);
    this.liveFlushTimer.unref();
  }

  public handleMessageCreate(message: Message): void {
    const cfg = this.getConfig();
    if (!cfg.enabled) return;
    if (!message.guildId || message.guildId !== cfg.guildId) return;
    if (message.author.bot) return;
    if (!message.member) return;
    if (!this.memberEligible(message.member, cfg.memberRoleIds)) return;

    this.store.addMessages({
      guildId: message.guildId,
      discordUserId: message.author.id,
      delta: 1,
      displayName: message.member.displayName || message.author.username,
    });
  }

  public handleVoiceStateUpdate(before: VoiceState, after: VoiceState): void {
    const cfg = this.getConfig();
    if (!cfg.enabled) return;

    const guildId = after.guild.id || before.guild.id;
    if (guildId !== cfg.guildId) return;

    const member = after.member ?? before.member;
    if (!member || member.user.bot) return;
    if (!this.memberEligible(member, cfg.memberRoleIds)) return;

    const key = `${guildId}:${member.id}`;
    const wasCounted = before.channelId !== null && !isAfkVoiceState(before);
    const isCounted = after.channelId !== null && !isAfkVoiceState(after);
    const displayName = member.displayName || member.user.username;

    // Join a normal voice channel OR move from AFK → normal voice.
    if (!wasCounted && isCounted) {
      this.voiceJoined.set(key, { joinedAtMs: Date.now(), displayName });
      return;
    }

    // Leave voice OR move from normal voice → AFK. Only the normal-channel time is saved.
    if (wasCounted && !isCounted) {
      this.flushVoice(key, guildId, member.id, displayName);
      return;
    }

    // Switching between two normal voice channels keeps one continuous counted session.
    if (wasCounted && isCounted && before.channelId !== after.channelId) {
      if (!this.voiceJoined.has(key)) {
        this.voiceJoined.set(key, { joinedAtMs: Date.now(), displayName });
      }
    }
  }

  public flushAllOpenSessions(): void {
    const now = Date.now();
    for (const [key, session] of [...this.voiceJoined.entries()]) {
      const [guildId, userId] = key.split(':');
      if (!guildId || !userId) continue;
      const minutes = Math.max(0, Math.floor((now - session.joinedAtMs) / 60_000));
      if (minutes > 0) {
        this.store.addVoiceMinutes({
          guildId,
          discordUserId: userId,
          minutes,
          displayName: session.displayName,
        });
        this.voiceJoined.set(key, {
          joinedAtMs: session.joinedAtMs + minutes * 60_000,
          displayName: session.displayName,
        });
      }
    }
  }

  private flushVoice(
    key: string,
    guildId: string,
    discordUserId: string,
    displayName?: string,
  ): void {
    const session = this.voiceJoined.get(key);
    this.voiceJoined.delete(key);
    if (!session) return;
    const minutes = Math.max(0, Math.floor((Date.now() - session.joinedAtMs) / 60_000));
    if (minutes <= 0) return;
    this.store.addVoiceMinutes({
      guildId,
      discordUserId,
      minutes,
      displayName: displayName ?? session.displayName,
    });
  }

  private memberEligible(member: GuildMember, memberRoleIds: readonly string[]): boolean {
    if (memberRoleIds.length === 0) return true;
    return memberRoleIds.some((roleId) => member.roles.cache.has(roleId));
  }
}
