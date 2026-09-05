export const CHANNEL_VALIDATION_CODES = [
  'CHANNEL_MISSING',
  'CHANNEL_WRONG_GUILD',
  'CHANNEL_UNSUPPORTED',
  'BOT_PERMISSION_MISSING',
  'CHANNEL_OK',
] as const;

export type ChannelValidationCode = (typeof CHANNEL_VALIDATION_CODES)[number];

export interface ChannelValidationResult {
  readonly channelId: string;
  readonly ok: boolean;
  readonly code?: ChannelValidationCode;
  readonly detail?: string;
}

/**
 * Narrow S2S port — activity-service must not talk to Discord SDK.
 * Backed by Discord Gateway `POST /internal/activity/v1/channels/validate`.
 */
export interface DiscordChannelValidationPort {
  validateChannels(
    guildId: string,
    channelIds: readonly string[],
  ): Promise<readonly ChannelValidationResult[]>;
}
