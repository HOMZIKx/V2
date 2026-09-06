/** Live Discord → daily buckets collector (MessageCreate + VoiceStateUpdate). */

import type { GuildMember, Message, VoiceState } from 'discord.js';

import type { MemberActivityConfig } from '../technika/capabilities.js';
import { MemberActivityStore } from './member-activity-store.js';

type VoiceSession = {
  readonly joinedAtMs: number;
  readonly displayName?: string;
};

export class MemberActivityCollector {
  private readonly voiceJoined = new Map<string, VoiceSession>();

  public constructor(
    private readonly store: MemberActivityStore,
    private readonly getConfig: () => MemberActivityConfig,
  ) {}

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
    const wasIn = before.channelId !== null;
    const isIn = after.channelId !== null;
    const displayName = member.displayName || member.user.username;

    if (!wasIn && isIn) {
      this.voiceJoined.set(key, { joinedAtMs: Date.now(), displayName });
      return;
    }

    if (wasIn && !isIn) {
      this.flushVoice(key, guildId, member.id, displayName);
      return;
    }

    if (wasIn && isIn && before.channelId !== after.channelId) {
      if (!this.voiceJoined.has(key)) {
        this.voiceJoined.set(key, { joinedAtMs: Date.now(), displayName });
      }
    }
  }

  public flushAllOpenSessions(): void {
    for (const [key, session] of [...this.voiceJoined.entries()]) {
      const [guildId, userId] = key.split(':');
      if (!guildId || !userId) continue;
      const minutes = Math.max(0, Math.floor((Date.now() - session.joinedAtMs) / 60_000));
      if (minutes > 0) {
        this.store.addVoiceMinutes({
          guildId,
          discordUserId: userId,
          minutes,
          displayName: session.displayName,
        });
      }
      this.voiceJoined.set(key, { joinedAtMs: Date.now(), displayName: session.displayName });
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
