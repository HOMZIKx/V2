export type PublicationTargetInput = {
  readonly guildId: string;
  readonly channelId: string;
  readonly participantLimit?: number | null;
};

/**
 * Ensures home guild is always present; merges optional multi-guild targets.
 * Dedupes by guildId (last channel wins).
 */
export function normalizePublicationTargets(input: {
  readonly homeGuildId: string;
  readonly homeChannelId: string | null;
  readonly targets?: readonly PublicationTargetInput[];
}): PublicationTargetInput[] {
  const byGuild = new Map<string, PublicationTargetInput>();

  if (input.homeChannelId !== null && input.homeChannelId.length > 0) {
    byGuild.set(input.homeGuildId, {
      guildId: input.homeGuildId,
      channelId: input.homeChannelId,
    });
  }

  for (const target of input.targets ?? []) {
    if (target.guildId.trim().length === 0 || target.channelId.trim().length === 0) {
      continue;
    }
    byGuild.set(target.guildId, {
      guildId: target.guildId,
      channelId: target.channelId,
      participantLimit: target.participantLimit ?? null,
    });
  }

  if (byGuild.size === 0 && input.homeChannelId !== null) {
    byGuild.set(input.homeGuildId, {
      guildId: input.homeGuildId,
      channelId: input.homeChannelId,
    });
  }

  return [...byGuild.values()];
}
