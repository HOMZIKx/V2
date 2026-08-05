import type {
  AuthorizationExplanation,
  AuthorizationScope,
  ConnectedGuildState,
  DecisionEffect,
  DecisionSubject,
  OperationClass,
  RuleSpecificity,
  ScopeType,
} from '../../domain/decision-engine.js';

export interface BootstrapOwnerCommand {
  readonly discordUserId: string;
  readonly v2UserId?: string;
  readonly actor?: string;
  readonly correlationId?: string;
}

export interface BootstrapOwnerResult {
  readonly organizationId: string;
  readonly ownerDiscordUserId: string;
  readonly ownerV2UserId?: string;
  readonly bootstrapCompletedAt: string;
  readonly alreadyCompleted: boolean;
}

export interface UpsertIdentityLinkCommand {
  readonly discordUserId: string;
  readonly v2UserId: string;
}

export interface IdentityLinkResult {
  readonly discordUserId: string;
  readonly v2UserId: string;
  readonly linkedAt: string;
}

export interface AuthorizeCommand {
  readonly subject: DecisionSubject;
  readonly permissionId: string;
  readonly scope: AuthorizationScope;
  readonly operationClass: OperationClass;
  readonly now?: Date;
}

export interface RegisterGuildCommand {
  readonly discordGuildId: string;
  readonly loginEntitling?: boolean;
}

export interface MemberSnapshot {
  readonly discordUserId: string;
  readonly v2UserId?: string;
  readonly roleIds: readonly string[];
  readonly status: 'active' | 'inactive';
}

export interface RoleSnapshot {
  readonly discordRoleId: string;
  readonly nameCache?: string;
}

export type DiscordEventPayload =
  | {
      readonly kind: 'member_upsert';
      readonly member: MemberSnapshot;
    }
  | {
      readonly kind: 'member_remove';
      readonly discordUserId: string;
    }
  | {
      readonly kind: 'roles_snapshot';
      readonly roles: readonly RoleSnapshot[];
    }
  | {
      readonly kind: 'guild_detach';
    };

export interface ApplyDiscordEventCommand {
  readonly eventKey: string;
  readonly eventType: string;
  readonly discordGuildId: string;
  readonly payload: DiscordEventPayload;
  readonly payloadHash?: string;
}

export interface ApplyDiscordEventResult {
  readonly applied: boolean;
  readonly duplicate: boolean;
  readonly revokedUserIds: readonly string[];
}

export interface ReconcileGuildCommand {
  readonly discordGuildId: string;
  readonly members: readonly MemberSnapshot[];
  readonly roles: readonly RoleSnapshot[];
  readonly eventKey?: string;
}

export interface ActivateGuildCommand {
  readonly discordGuildId: string;
  readonly loginEntitling: boolean;
}

export interface CreateGrantCommand {
  readonly effect: DecisionEffect;
  readonly permissionId?: string;
  readonly groupId?: string;
  readonly discordUserId?: string;
  readonly v2UserId?: string;
  readonly scopeType: ScopeType;
  readonly scopeGuildId?: string;
  readonly specificity: RuleSpecificity;
  readonly reason?: string;
  readonly createdBy?: string;
  readonly expiresAt?: Date;
}

export interface CreateBlockCommand {
  readonly discordUserId?: string;
  readonly v2UserId?: string;
  readonly scopeType: 'global' | 'guild';
  readonly scopeGuildId?: string;
  readonly reason: string;
  readonly createdBy?: string;
  readonly expiresAt?: Date;
}

export interface EnsureOrganizationResult {
  readonly id: string;
  readonly created: boolean;
}

/**
 * Persistence and query port for Authorization. Implemented by infrastructure;
 * domain/application never import Nest or `pg`.
 */
export interface AuthorizationStorePort {
  ensureOrganization(preferredId?: string): Promise<EnsureOrganizationResult>;
  ping(): Promise<void>;
  bootstrapOwner(command: BootstrapOwnerCommand): Promise<BootstrapOwnerResult>;
  upsertIdentityLink(command: UpsertIdentityLinkCommand): Promise<IdentityLinkResult>;
  authorize(command: AuthorizeCommand): Promise<AuthorizationExplanation>;
  registerGuild(command: RegisterGuildCommand): Promise<ConnectedGuildState>;
  applyDiscordEvent(command: ApplyDiscordEventCommand): Promise<ApplyDiscordEventResult>;
  reconcileGuild(command: ReconcileGuildCommand): Promise<ApplyDiscordEventResult>;
  activateGuild(command: ActivateGuildCommand): Promise<{
    readonly guild: ConnectedGuildState;
    readonly revokedUserIds: readonly string[];
  }>;
  createGrant(command: CreateGrantCommand): Promise<{ readonly id: string }>;
  createBlock(command: CreateBlockCommand): Promise<{ readonly id: string }>;
}

/** Outbound call to Identity system revoke. */
export interface SessionRevokePort {
  revokeAllSessionsForUser(v2UserId: string): Promise<void>;
}
