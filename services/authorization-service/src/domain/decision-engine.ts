export type DecisionEffect = 'allow' | 'deny';

export type RuleSpecificity = 'user' | 'guild' | 'organization' | 'group_default';

export type ScopeType = 'organization' | 'guild';

export type OperationClass = 'ordinary' | 'sensitive';

export type GuildLifecycleStatus = 'pending_sync' | 'active' | 'inactive_detached';

export type SyncStatus = 'fresh' | 'stale' | 'unavailable';

export type MembershipStatus = 'active' | 'inactive';

export interface AuthorizationScope {
  readonly type: ScopeType;
  readonly guildId?: string;
}

export interface DecisionSubject {
  readonly v2UserId?: string;
  readonly discordUserId?: string;
}

export interface AccessBlockRecord {
  readonly id: string;
  readonly scopeType: 'global' | 'guild';
  readonly scopeGuildId?: string;
  readonly reason: string;
  readonly expiresAt?: Date;
}

export interface AccessGrantRecord {
  readonly id: string;
  readonly effect: DecisionEffect;
  readonly permissionId?: string;
  readonly groupId?: string;
  readonly scopeType: ScopeType;
  readonly scopeGuildId?: string;
  readonly specificity: RuleSpecificity;
  readonly expiresAt?: Date;
  readonly source: string;
}

export interface MappedPermissionGrant {
  readonly permissionId: string;
  readonly guildId: string;
  readonly source: string;
  readonly mappingId: string;
}

export interface OrganizationOwner {
  readonly ownerDiscordUserId: string;
  readonly ownerV2UserId?: string;
  readonly bootstrapCompletedAt: Date;
}

export interface ConnectedGuildState {
  readonly discordGuildId: string;
  readonly status: GuildLifecycleStatus;
  readonly loginEntitling: boolean;
  readonly syncStatus: SyncStatus;
  readonly lastFreshAt?: Date;
}

export interface MembershipState {
  readonly discordGuildId: string;
  readonly discordUserId: string;
  readonly v2UserId?: string;
  readonly status: MembershipStatus;
  readonly roleIds: readonly string[];
}

export interface AuthorizeInput {
  readonly subject: DecisionSubject;
  readonly permissionId: string;
  readonly scope: AuthorizationScope;
  readonly operationClass: OperationClass;
  readonly now: Date;
  readonly trustWindowSeconds: number;
}

export interface AuthorizeContext {
  readonly owner?: OrganizationOwner;
  readonly blocks: readonly AccessBlockRecord[];
  readonly grants: readonly AccessGrantRecord[];
  readonly mappedPermissions: readonly MappedPermissionGrant[];
  readonly memberships: readonly MembershipState[];
  readonly guilds: readonly ConnectedGuildState[];
  readonly identityLinked: boolean;
}

export interface AuthorizationExplanation {
  readonly decision: DecisionEffect;
  readonly permissionId: string;
  readonly scope: AuthorizationScope;
  readonly winningRuleId?: string;
  readonly source?: string;
  readonly specificity?: RuleSpecificity | 'block' | 'owner_shield' | 'sync_gate' | 'login_gate';
  readonly syncStatus?: SyncStatus;
  readonly dataAgeSeconds?: number;
  readonly appliedPolicyFlags: readonly string[];
  readonly reason: string;
}

const SPECIFICITY_RANK: Record<RuleSpecificity, number> = {
  user: 4,
  guild: 3,
  organization: 2,
  group_default: 1,
};

function isExpired(expiresAt: Date | undefined, now: Date): boolean {
  return expiresAt !== undefined && expiresAt.getTime() <= now.getTime();
}

function subjectMatchesOwner(subject: DecisionSubject, owner: OrganizationOwner): boolean {
  if (
    owner.ownerV2UserId !== undefined &&
    subject.v2UserId !== undefined &&
    owner.ownerV2UserId === subject.v2UserId
  ) {
    return true;
  }
  return subject.discordUserId !== undefined && subject.discordUserId === owner.ownerDiscordUserId;
}

function blockApplies(block: AccessBlockRecord, scope: AuthorizationScope, now: Date): boolean {
  if (isExpired(block.expiresAt, now)) {
    return false;
  }
  if (block.scopeType === 'global') {
    return true;
  }
  return scope.type === 'guild' && block.scopeGuildId === scope.guildId;
}

function grantAppliesToScope(grant: AccessGrantRecord, scope: AuthorizationScope): boolean {
  if (grant.scopeType === 'organization') {
    return true;
  }
  return scope.type === 'guild' && grant.scopeGuildId === scope.guildId;
}

function evaluateSyncGate(
  guilds: readonly ConnectedGuildState[],
  relevantGuildIds: readonly string[],
  operationClass: OperationClass,
  now: Date,
  trustWindowSeconds: number,
): { ok: boolean; syncStatus?: SyncStatus; dataAgeSeconds?: number; flag?: string } {
  if (relevantGuildIds.length === 0) {
    return { ok: true };
  }

  let worst: SyncStatus = 'fresh';
  let oldestFresh: Date | undefined;

  for (const guildId of relevantGuildIds) {
    const guild = guilds.find((entry) => entry.discordGuildId === guildId);
    if (guild === undefined) {
      return { ok: false, syncStatus: 'unavailable', flag: 'missing_guild' };
    }
    if (guild.syncStatus === 'unavailable') {
      worst = 'unavailable';
    } else if (guild.syncStatus === 'stale' && worst === 'fresh') {
      worst = 'stale';
    }
    if (guild.lastFreshAt !== undefined) {
      if (oldestFresh === undefined || guild.lastFreshAt < oldestFresh) {
        oldestFresh = guild.lastFreshAt;
      }
    }
  }

  const dataAgeSeconds =
    oldestFresh === undefined
      ? undefined
      : Math.max(0, Math.floor((now.getTime() - oldestFresh.getTime()) / 1000));

  const withAge = <T extends { ok: boolean; syncStatus: SyncStatus; flag?: string }>(
    base: T,
  ): T & { dataAgeSeconds?: number } =>
    dataAgeSeconds === undefined ? base : { ...base, dataAgeSeconds };

  if (worst === 'fresh') {
    return withAge({ ok: true, syncStatus: 'fresh' });
  }

  if (operationClass === 'sensitive') {
    return withAge({
      ok: false,
      syncStatus: worst,
      flag: 'sensitive_requires_fresh',
    });
  }

  // P3-D7: ordinary ops may use last fresh state briefly for both stale and
  // unavailable (transient Discord outage), never for sensitive ops.
  if (
    (worst === 'stale' || worst === 'unavailable') &&
    oldestFresh !== undefined &&
    now.getTime() - oldestFresh.getTime() <= trustWindowSeconds * 1000
  ) {
    return withAge({
      ok: true,
      syncStatus: worst,
      flag: 'ordinary_trust_window',
    });
  }

  return withAge({
    ok: false,
    syncStatus: worst,
    flag: 'trust_window_expired_or_unavailable',
  });
}

function guildBlockAppliesToGuild(block: AccessBlockRecord, guildId: string, now: Date): boolean {
  if (isExpired(block.expiresAt, now)) {
    return false;
  }
  return block.scopeType === 'guild' && block.scopeGuildId === guildId;
}

/**
 * Pure authorization decision engine (P3-D6 + blocks + owner shield + sync gates).
 * No Nest/Discord/pg imports.
 */
export function decideAuthorization(
  input: AuthorizeInput,
  context: AuthorizeContext,
  options?: { readonly groupPermissionIdsForGrants?: ReadonlyMap<string, readonly string[]> },
): AuthorizationExplanation {
  const flags: string[] = [];
  const { subject, permissionId, scope, operationClass, now, trustWindowSeconds } = input;

  if (context.owner !== undefined && subjectMatchesOwner(subject, context.owner)) {
    if (
      permissionId === 'permission.platform.login.www' ||
      permissionId.startsWith('permission.authorization.policy.')
    ) {
      flags.push('owner_shield');
      return {
        decision: 'allow',
        permissionId,
        scope,
        winningRuleId: 'organization-owner',
        source: 'owner_shield',
        specificity: 'owner_shield',
        appliedPolicyFlags: flags,
        reason: 'Organization owner is shielded from accidental local denies',
      };
    }
  }

  const activeBlocks = context.blocks.filter((block) => blockApplies(block, scope, now));
  if (activeBlocks.length > 0) {
    const block = activeBlocks[0]!;
    flags.push('access_block');
    return {
      decision: 'deny',
      permissionId,
      scope,
      winningRuleId: block.id,
      source: 'access_block',
      specificity: 'block',
      appliedPolicyFlags: flags,
      reason: block.reason,
    };
  }

  if (permissionId === 'permission.platform.login.www') {
    if (!context.identityLinked && subject.v2UserId !== undefined) {
      flags.push('identity_link_missing');
      return {
        decision: 'deny',
        permissionId,
        scope,
        specificity: 'login_gate',
        appliedPolicyFlags: flags,
        reason: 'Discord identity is not linked to V2 user',
      };
    }

    // Unified login decision: membership entitlements and access_grant rows
    // compete under specificity + deny-wins-on-tie. Do not short-circuit before
    // evaluating grants.
    type Candidate = {
      readonly id: string;
      readonly effect: DecisionEffect;
      readonly specificity: RuleSpecificity;
      readonly source: string;
      readonly syncStatus?: SyncStatus;
      readonly dataAgeSeconds?: number;
    };
    const candidates: Candidate[] = [];

    const entitlingGuilds = context.guilds.filter(
      (guild) => guild.status === 'active' && guild.loginEntitling,
    );

    let sawMembershipCandidate = false;
    let lastFailedSync: {
      syncStatus?: SyncStatus;
      dataAgeSeconds?: number;
      flag?: string;
    } = {};

    for (const guild of entitlingGuilds) {
      const membership = context.memberships.find(
        (entry) => entry.status === 'active' && entry.discordGuildId === guild.discordGuildId,
      );
      if (membership === undefined) {
        continue;
      }
      sawMembershipCandidate = true;

      const blockedOnGuild = context.blocks.some((candidate) =>
        guildBlockAppliesToGuild(candidate, guild.discordGuildId, now),
      );
      if (blockedOnGuild) {
        flags.push(`guild_block:${guild.discordGuildId}`);
        continue;
      }

      const sync = evaluateSyncGate(
        context.guilds,
        [guild.discordGuildId],
        'sensitive',
        now,
        trustWindowSeconds,
      );
      if (!sync.ok) {
        lastFailedSync = sync;
        if (sync.flag !== undefined) {
          flags.push(`${sync.flag}:${guild.discordGuildId}`);
        }
        continue;
      }

      candidates.push({
        id: `login_entitlement:${guild.discordGuildId}`,
        effect: 'allow',
        specificity: 'guild',
        source: 'login_entitling_membership',
        ...(sync.syncStatus !== undefined ? { syncStatus: sync.syncStatus } : {}),
        ...(sync.dataAgeSeconds !== undefined ? { dataAgeSeconds: sync.dataAgeSeconds } : {}),
      });
    }

    for (const grant of context.grants) {
      if (isExpired(grant.expiresAt, now)) {
        continue;
      }
      if (!grantAppliesToScope(grant, scope)) {
        continue;
      }
      const groupPerms =
        grant.groupId === undefined
          ? []
          : (options?.groupPermissionIdsForGrants?.get(grant.groupId) ?? []);
      const matchesPermission =
        grant.permissionId === permissionId ||
        (grant.groupId !== undefined && groupPerms.includes(permissionId));
      if (!matchesPermission) {
        continue;
      }
      candidates.push({
        id: grant.id,
        effect: grant.effect,
        specificity: grant.specificity,
        source: grant.source,
      });
    }

    if (candidates.length === 0) {
      if (sawMembershipCandidate) {
        return {
          decision: 'deny',
          permissionId,
          scope,
          specificity: 'sync_gate',
          ...(lastFailedSync.syncStatus !== undefined
            ? { syncStatus: lastFailedSync.syncStatus }
            : {}),
          ...(lastFailedSync.dataAgeSeconds !== undefined
            ? { dataAgeSeconds: lastFailedSync.dataAgeSeconds }
            : {}),
          appliedPolicyFlags: flags,
          reason: 'No login_entitling guild satisfies fresh sync without a guild block',
        };
      }
      flags.push('login_entitlement_missing');
      return {
        decision: 'deny',
        permissionId,
        scope,
        specificity: 'login_gate',
        appliedPolicyFlags: flags,
        reason: 'No active membership on a login_entitling guild and no matching login grant',
      };
    }

    candidates.sort((left, right) => {
      const rankDiff = SPECIFICITY_RANK[right.specificity] - SPECIFICITY_RANK[left.specificity];
      if (rankDiff !== 0) {
        return rankDiff;
      }
      if (left.effect !== right.effect) {
        return left.effect === 'deny' ? -1 : 1;
      }
      return left.id.localeCompare(right.id);
    });

    const winner = candidates[0]!;
    if (winner.effect === 'allow' && winner.source === 'login_entitling_membership') {
      flags.push('login_entitlement_ok');
      flags.push(`login_guild:${winner.id.replace('login_entitlement:', '')}`);
    }
    flags.push(`specificity:${winner.specificity}`);
    return {
      decision: winner.effect,
      permissionId,
      scope,
      winningRuleId: winner.id,
      source: winner.source,
      specificity: winner.specificity,
      ...(winner.syncStatus !== undefined ? { syncStatus: winner.syncStatus } : {}),
      ...(winner.dataAgeSeconds !== undefined ? { dataAgeSeconds: winner.dataAgeSeconds } : {}),
      appliedPolicyFlags: flags,
      reason:
        winner.effect === 'allow'
          ? winner.source === 'login_entitling_membership'
            ? 'Active membership on login_entitling guild'
            : 'Matching allow login grant won by specificity'
          : 'Matching deny login grant won by specificity or deny-on-tie',
    };
  }

  if (scope.type === 'guild') {
    const guild = context.guilds.find((entry) => entry.discordGuildId === scope.guildId);
    if (guild === undefined || guild.status !== 'active') {
      flags.push('guild_not_active');
      return {
        decision: 'deny',
        permissionId,
        scope,
        specificity: 'guild',
        appliedPolicyFlags: flags,
        reason: 'Guild is not active in the organization',
      };
    }

    const sync = evaluateSyncGate(
      context.guilds,
      [guild.discordGuildId],
      operationClass,
      now,
      trustWindowSeconds,
    );
    if (sync.flag !== undefined) {
      flags.push(sync.flag);
    }
    if (!sync.ok) {
      return {
        decision: 'deny',
        permissionId,
        scope,
        specificity: 'sync_gate',
        ...(sync.syncStatus !== undefined ? { syncStatus: sync.syncStatus } : {}),
        ...(sync.dataAgeSeconds !== undefined ? { dataAgeSeconds: sync.dataAgeSeconds } : {}),
        appliedPolicyFlags: flags,
        reason: 'Sync state does not allow this operation',
      };
    }
  }

  type Candidate = {
    readonly id: string;
    readonly effect: DecisionEffect;
    readonly specificity: RuleSpecificity;
    readonly source: string;
  };

  const candidates: Candidate[] = [];

  for (const grant of context.grants) {
    if (isExpired(grant.expiresAt, now)) {
      continue;
    }
    if (!grantAppliesToScope(grant, scope)) {
      continue;
    }

    const groupPerms =
      grant.groupId === undefined
        ? []
        : (options?.groupPermissionIdsForGrants?.get(grant.groupId) ?? []);

    const matchesPermission =
      grant.permissionId === permissionId ||
      (grant.groupId !== undefined && groupPerms.includes(permissionId));
    if (!matchesPermission) {
      continue;
    }

    candidates.push({
      id: grant.id,
      effect: grant.effect,
      specificity: grant.specificity,
      source: grant.source,
    });
  }

  for (const mapped of context.mappedPermissions) {
    if (mapped.permissionId !== permissionId) {
      continue;
    }
    if (scope.type === 'guild' && mapped.guildId !== scope.guildId) {
      continue;
    }
    if (scope.type === 'organization') {
      continue;
    }
    candidates.push({
      id: mapped.mappingId,
      effect: 'allow',
      specificity: 'group_default',
      source: mapped.source,
    });
  }

  if (candidates.length === 0) {
    return {
      decision: 'deny',
      permissionId,
      scope,
      appliedPolicyFlags: flags,
      reason: 'No matching allow rule',
    };
  }

  candidates.sort((left, right) => {
    const rankDiff = SPECIFICITY_RANK[right.specificity] - SPECIFICITY_RANK[left.specificity];
    if (rankDiff !== 0) {
      return rankDiff;
    }
    if (left.effect !== right.effect) {
      return left.effect === 'deny' ? -1 : 1;
    }
    return left.id.localeCompare(right.id);
  });

  const winner = candidates[0]!;
  flags.push(`specificity:${winner.specificity}`);
  return {
    decision: winner.effect,
    permissionId,
    scope,
    winningRuleId: winner.id,
    source: winner.source,
    specificity: winner.specificity,
    appliedPolicyFlags: flags,
    reason:
      winner.effect === 'allow'
        ? 'Matching allow rule won by specificity'
        : 'Matching deny rule won by specificity or deny-on-tie',
  };
}
