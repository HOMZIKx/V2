/**
 * Outbound Discord → Authorization sync (P3-D1 / P3-D20).
 * Implemented in infrastructure; application never imports Nest/HTTP/jose.
 */

/**
 * Membership snapshot from Discord Gateway.
 * Must never carry `v2UserId` — only Identity may create Discord↔V2 links;
 * Authorization resolves V2 from `discord_identity_link`.
 */
export type AuthzMemberSnapshot = {
  readonly discordUserId: string;
  readonly roleIds: readonly string[];
  readonly status: 'active' | 'inactive';
};

export type AuthzRoleSnapshot = {
  readonly discordRoleId: string;
  readonly nameCache?: string;
};

export type AuthzDiscordEventPayload =
  | {
      readonly kind: 'member_upsert';
      readonly member: AuthzMemberSnapshot;
    }
  | {
      readonly kind: 'member_remove';
      readonly discordUserId: string;
    }
  | {
      readonly kind: 'roles_snapshot';
      readonly roles: readonly AuthzRoleSnapshot[];
    }
  | {
      readonly kind: 'guild_detach';
    }
  | {
      readonly kind: 'guild_unavailable';
    };

export type AuthzDiscordEventInput = {
  readonly eventKey: string;
  readonly eventType: string;
  readonly discordGuildId: string;
  readonly payload: AuthzDiscordEventPayload;
  readonly payloadHash?: string;
};

export type AuthzReconcileSnapshot = {
  readonly members: readonly AuthzMemberSnapshot[];
  readonly roles: readonly AuthzRoleSnapshot[];
  readonly eventKey?: string;
};

export interface AuthorizationSyncPort {
  registerGuild(discordGuildId: string): Promise<void>;
  applyDiscordEvent(input: AuthzDiscordEventInput): Promise<void>;
  reconcileGuild(discordGuildId: string, snapshot: AuthzReconcileSnapshot): Promise<void>;
}
