/**
 * In-process lifecycle epochs for Discord → Authorization event identity.
 *
 * Identity-only keys (remove / unavailable / detach) must dedupe *retries* of
 * the same logical delivery, but must not collide with a later, legitimate
 * cycle (leave→rejoin→leave, unavailable→fresh→unavailable, detach→reconnect→detach).
 *
 * Epochs bump on the restoring event so the next terminating event gets a new key.
 * Retries of the same terminating event reuse the current epoch (same key).
 */
export class GuildLifecycleEpochStore {
  private readonly membership = new Map<string, number>();
  private readonly availability = new Map<string, number>();
  private readonly attachment = new Map<string, number>();

  public membershipEpoch(guildId: string, discordUserId: string): number {
    return this.membership.get(this.memberKey(guildId, discordUserId)) ?? 0;
  }

  /** Call after a successful member add / rejoin restores membership. */
  public bumpMembershipEpoch(guildId: string, discordUserId: string): void {
    const key = this.memberKey(guildId, discordUserId);
    this.membership.set(key, this.membershipEpoch(guildId, discordUserId) + 1);
  }

  public availabilityEpoch(guildId: string): number {
    return this.availability.get(guildId) ?? 0;
  }

  /** Call after reconcile marks the guild fresh again. */
  public bumpAvailabilityEpoch(guildId: string): void {
    this.availability.set(guildId, this.availabilityEpoch(guildId) + 1);
  }

  public attachmentEpoch(guildId: string): number {
    return this.attachment.get(guildId) ?? 0;
  }

  /** Call when the guild is registered / reconnected after detach. */
  public bumpAttachmentEpoch(guildId: string): void {
    this.attachment.set(guildId, this.attachmentEpoch(guildId) + 1);
  }

  private memberKey(guildId: string, discordUserId: string): string {
    return `${guildId}:${discordUserId}`;
  }
}
