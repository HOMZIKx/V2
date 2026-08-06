/**
 * @deprecated Process-local epochs are NOT the source of truth for Discord
 * lifecycle occurrence identity. Authorization DB generations
 * (`lifecycle_generation`, `availability_generation`, `attachment_generation`)
 * define durable `processed_event.event_key` values.
 *
 * Gateway may omit generation suffixes on terminating event keys; Authorization
 * rewrites them from durable state. This module remains only as a thin optional
 * cache helper for diagnostics — never as SoT.
 */
export class GuildLifecycleEpochStore {
  private readonly membership = new Map<string, number>();
  private readonly availability = new Map<string, number>();
  private readonly attachment = new Map<string, number>();

  public membershipEpoch(guildId: string, discordUserId: string): number {
    return this.membership.get(this.memberKey(guildId, discordUserId)) ?? 0;
  }

  public bumpMembershipEpoch(guildId: string, discordUserId: string): void {
    const key = this.memberKey(guildId, discordUserId);
    this.membership.set(key, this.membershipEpoch(guildId, discordUserId) + 1);
  }

  public availabilityEpoch(guildId: string): number {
    return this.availability.get(guildId) ?? 0;
  }

  public bumpAvailabilityEpoch(guildId: string): void {
    this.availability.set(guildId, this.availabilityEpoch(guildId) + 1);
  }

  public attachmentEpoch(guildId: string): number {
    return this.attachment.get(guildId) ?? 0;
  }

  public bumpAttachmentEpoch(guildId: string): void {
    this.attachment.set(guildId, this.attachmentEpoch(guildId) + 1);
  }

  private memberKey(guildId: string, discordUserId: string): string {
    return `${guildId}:${discordUserId}`;
  }
}
