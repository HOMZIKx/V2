/**
 * Structured channel retirement model — no automatic Discord channel deletion.
 */

export const CHANNEL_RETIREMENT_STATUSES = [
  'LEGACY_ACTIVE',
  'V2_READY',
  'OWNER_CAN_RETIRE',
] as const;

export type ChannelRetirementStatus = (typeof CHANNEL_RETIREMENT_STATUSES)[number];

export type LegacyChannelRecord = {
  readonly guildId: string;
  readonly channelId: string;
  readonly label: string;
  readonly relatedModuleKey: string | null;
  readonly status: ChannelRetirementStatus;
  readonly notes: string | null;
};

export function canOwnerRetireChannel(status: ChannelRetirementStatus): boolean {
  return status === 'OWNER_CAN_RETIRE';
}
