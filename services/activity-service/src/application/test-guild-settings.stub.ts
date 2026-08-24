import type { GuildActivitySettingsRecord } from './ports/activity.ports.js';

export function stubGuildSettings(
  overrides: Partial<GuildActivitySettingsRecord> = {},
): GuildActivitySettingsRecord {
  return {
    guildId: 'g1',
    orgId: 'o1',
    organizerDefaultStatusId: null,
    waitlistPromotionStatusId: null,
    maxActivePerCreator: 5,
    registrationDefaultClosesAtStart: true,
    allowedPublishChannelIds: [],
    configRevision: 1,
    allowOtherActivity: true,
    maxCreateHorizonDays: 90,
    postRetentionHoursAfterFinish: 24,
    reminders: [],
    dmNotificationsEnabled: true,
    pingRoleIds: [],
    hubChannelId: null,
    ...overrides,
  };
}
