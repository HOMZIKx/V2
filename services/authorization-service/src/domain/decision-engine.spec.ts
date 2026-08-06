import { describe, expect, it } from 'vitest';

import {
  decideAuthorization,
  type AccessBlockRecord,
  type AccessGrantRecord,
  type AuthorizeContext,
  type AuthorizeInput,
  type ConnectedGuildState,
  type MappedPermissionGrant,
  type MembershipState,
  type OrganizationOwner,
  type RuleSpecificity,
} from './decision-engine.js';

const NOW = new Date('2026-08-05T12:00:00.000Z');
const TRUST_WINDOW_SECONDS = 120;
const PERMISSION = 'permission.guild.moderate.members';
const LOGIN_PERMISSION = 'permission.platform.login.www';
const POLICY_PERMISSION = 'permission.authorization.policy.write';
const GUILD_A = 'guild-a';
const GUILD_B = 'guild-b';
const ORG_SCOPE = { type: 'organization' as const };
const GUILD_A_SCOPE = { type: 'guild' as const, guildId: GUILD_A };
const GUILD_B_SCOPE = { type: 'guild' as const, guildId: GUILD_B };

const OWNER: OrganizationOwner = {
  ownerDiscordUserId: 'owner-discord',
  ownerV2UserId: 'owner-v2',
  bootstrapCompletedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function activeGuild(
  discordGuildId: string,
  overrides: Partial<ConnectedGuildState> = {},
): ConnectedGuildState {
  return {
    discordGuildId,
    status: 'active',
    loginEntitling: false,
    syncStatus: 'fresh',
    lastFreshAt: NOW,
    ...overrides,
  };
}

function membership(
  discordGuildId: string,
  overrides: Partial<MembershipState> = {},
): MembershipState {
  return {
    discordGuildId,
    discordUserId: 'user-discord',
    v2UserId: 'user-v2',
    status: 'active',
    roleIds: [],
    ...overrides,
  };
}

function grant(partial: {
  id: string;
  effect: 'allow' | 'deny';
  specificity: RuleSpecificity;
  permissionId?: string;
  groupId?: string;
  scopeType?: 'organization' | 'guild';
  scopeGuildId?: string;
  expiresAt?: Date;
  source?: string;
}): AccessGrantRecord {
  return {
    id: partial.id,
    effect: partial.effect,
    permissionId: partial.permissionId ?? PERMISSION,
    scopeType: partial.scopeType ?? 'guild',
    scopeGuildId: partial.scopeGuildId ?? GUILD_A,
    specificity: partial.specificity,
    source: partial.source ?? 'test',
    ...(partial.groupId !== undefined ? { groupId: partial.groupId } : {}),
    ...(partial.expiresAt !== undefined ? { expiresAt: partial.expiresAt } : {}),
  };
}

function block(
  partial: Partial<AccessBlockRecord> & Pick<AccessBlockRecord, 'id'>,
): AccessBlockRecord {
  return {
    scopeType: 'global',
    reason: 'blocked',
    ...partial,
  };
}

function baseInput(overrides: Partial<AuthorizeInput> = {}): AuthorizeInput {
  return {
    subject: { v2UserId: 'user-v2', discordUserId: 'user-discord' },
    permissionId: PERMISSION,
    scope: GUILD_A_SCOPE,
    operationClass: 'ordinary',
    now: NOW,
    trustWindowSeconds: TRUST_WINDOW_SECONDS,
    ...overrides,
  };
}

function baseContext(overrides: Partial<AuthorizeContext> = {}): AuthorizeContext {
  return {
    owner: OWNER,
    blocks: [],
    grants: [],
    mappedPermissions: [],
    memberships: [membership(GUILD_A)],
    guilds: [activeGuild(GUILD_A), activeGuild(GUILD_B)],
    identityLinked: true,
    ...overrides,
  };
}

describe('decideAuthorization — specificity ranking', () => {
  it('prefers user over guild over organization over group_default', () => {
    const context = baseContext({
      grants: [
        grant({ id: 'group', effect: 'deny', specificity: 'group_default' }),
        grant({
          id: 'org',
          effect: 'deny',
          specificity: 'organization',
          scopeType: 'organization',
        }),
        grant({ id: 'guild', effect: 'deny', specificity: 'guild' }),
        grant({ id: 'user', effect: 'allow', specificity: 'user' }),
      ],
    });

    const result = decideAuthorization(baseInput(), context);
    expect(result.decision).toBe('allow');
    expect(result.winningRuleId).toBe('user');
    expect(result.specificity).toBe('user');
  });

  it('prefers guild over organization when user rule is absent', () => {
    const context = baseContext({
      grants: [
        grant({
          id: 'org-allow',
          effect: 'allow',
          specificity: 'organization',
          scopeType: 'organization',
        }),
        grant({ id: 'guild-deny', effect: 'deny', specificity: 'guild' }),
      ],
    });

    const result = decideAuthorization(baseInput(), context);
    expect(result.decision).toBe('deny');
    expect(result.winningRuleId).toBe('guild-deny');
    expect(result.specificity).toBe('guild');
  });

  it('prefers organization over group_default / mapped permissions', () => {
    const mapped: MappedPermissionGrant = {
      permissionId: PERMISSION,
      guildId: GUILD_A,
      source: 'role_map',
      mappingId: 'mapped-allow',
    };
    const context = baseContext({
      grants: [
        grant({
          id: 'org-deny',
          effect: 'deny',
          specificity: 'organization',
          scopeType: 'organization',
        }),
      ],
      mappedPermissions: [mapped],
    });

    const result = decideAuthorization(baseInput(), context);
    expect(result.decision).toBe('deny');
    expect(result.winningRuleId).toBe('org-deny');
    expect(result.specificity).toBe('organization');
  });
});

describe('decideAuthorization — deny on tie', () => {
  it('chooses deny when two rules share the same specificity', () => {
    const context = baseContext({
      grants: [
        grant({ id: 'allow-a', effect: 'allow', specificity: 'user' }),
        grant({ id: 'deny-b', effect: 'deny', specificity: 'user' }),
      ],
    });

    const result = decideAuthorization(baseInput(), context);
    expect(result.decision).toBe('deny');
    expect(result.winningRuleId).toBe('deny-b');
    expect(result.reason).toContain('deny');
  });

  it('uses stable id ordering after deny-on-tie among same effect', () => {
    const context = baseContext({
      grants: [
        grant({ id: 'z-deny', effect: 'deny', specificity: 'guild' }),
        grant({ id: 'a-deny', effect: 'deny', specificity: 'guild' }),
      ],
    });

    const result = decideAuthorization(baseInput(), context);
    expect(result.decision).toBe('deny');
    expect(result.winningRuleId).toBe('a-deny');
  });
});

describe('decideAuthorization — blocks before allow', () => {
  it('denies on a global block even when a user allow exists', () => {
    const context = baseContext({
      blocks: [block({ id: 'block-1', reason: 'tos violation' })],
      grants: [grant({ id: 'user-allow', effect: 'allow', specificity: 'user' })],
    });

    const result = decideAuthorization(baseInput(), context);
    expect(result.decision).toBe('deny');
    expect(result.winningRuleId).toBe('block-1');
    expect(result.specificity).toBe('block');
    expect(result.reason).toBe('tos violation');
    expect(result.appliedPolicyFlags).toContain('access_block');
  });

  it('applies guild-scoped blocks only to that guild', () => {
    const context = baseContext({
      blocks: [
        block({
          id: 'guild-block',
          scopeType: 'guild',
          scopeGuildId: GUILD_A,
          reason: 'guild quarantine',
        }),
      ],
      grants: [
        grant({
          id: 'allow-b',
          effect: 'allow',
          specificity: 'user',
          scopeGuildId: GUILD_B,
        }),
      ],
    });

    const denied = decideAuthorization(baseInput({ scope: GUILD_A_SCOPE }), context);
    expect(denied.decision).toBe('deny');
    expect(denied.winningRuleId).toBe('guild-block');

    const allowed = decideAuthorization(baseInput({ scope: GUILD_B_SCOPE }), context);
    expect(allowed.decision).toBe('allow');
    expect(allowed.winningRuleId).toBe('allow-b');
  });
});

describe('decideAuthorization — owner shield', () => {
  it('allows owner for login and authorization.policy.* despite deny grants', () => {
    const context = baseContext({
      grants: [
        grant({
          id: 'deny-login',
          effect: 'deny',
          specificity: 'user',
          permissionId: LOGIN_PERMISSION,
          scopeType: 'organization',
        }),
      ],
    });

    const login = decideAuthorization(
      baseInput({
        subject: { v2UserId: 'owner-v2', discordUserId: 'owner-discord' },
        permissionId: LOGIN_PERMISSION,
        scope: ORG_SCOPE,
      }),
      context,
    );
    expect(login.decision).toBe('allow');
    expect(login.specificity).toBe('owner_shield');

    const policy = decideAuthorization(
      baseInput({
        subject: { discordUserId: 'owner-discord' },
        permissionId: POLICY_PERMISSION,
        scope: ORG_SCOPE,
      }),
      context,
    );
    expect(policy.decision).toBe('allow');
    expect(policy.source).toBe('owner_shield');
  });

  it('does not shield ordinary permissions for the owner', () => {
    const context = baseContext({
      grants: [grant({ id: 'deny-mod', effect: 'deny', specificity: 'user' })],
    });

    const result = decideAuthorization(
      baseInput({
        subject: { v2UserId: 'owner-v2', discordUserId: 'owner-discord' },
      }),
      context,
    );
    expect(result.decision).toBe('deny');
    expect(result.winningRuleId).toBe('deny-mod');
  });
});

describe('decideAuthorization — cross-guild isolation', () => {
  it('does not apply a guild-scoped grant to another guild', () => {
    const context = baseContext({
      grants: [
        grant({
          id: 'allow-a-only',
          effect: 'allow',
          specificity: 'user',
          scopeGuildId: GUILD_A,
        }),
      ],
    });

    const onA = decideAuthorization(baseInput({ scope: GUILD_A_SCOPE }), context);
    expect(onA.decision).toBe('allow');

    const onB = decideAuthorization(baseInput({ scope: GUILD_B_SCOPE }), context);
    expect(onB.decision).toBe('deny');
    expect(onB.reason).toBe('No matching allow rule');
  });

  it('ignores mapped permissions from a different guild', () => {
    const context = baseContext({
      mappedPermissions: [
        {
          permissionId: PERMISSION,
          guildId: GUILD_B,
          source: 'role_map',
          mappingId: 'map-b',
        },
      ],
    });

    const result = decideAuthorization(baseInput({ scope: GUILD_A_SCOPE }), context);
    expect(result.decision).toBe('deny');
    expect(result.reason).toBe('No matching allow rule');
  });
});

describe('decideAuthorization — login entitling and stale deny', () => {
  it('allows login when membership is on an active login_entitling guild with fresh sync', () => {
    const context = baseContext({
      guilds: [
        activeGuild(GUILD_A, { loginEntitling: true, syncStatus: 'fresh', lastFreshAt: NOW }),
      ],
      memberships: [membership(GUILD_A)],
      identityLinked: true,
    });

    const result = decideAuthorization(
      baseInput({ permissionId: LOGIN_PERMISSION, scope: ORG_SCOPE }),
      context,
    );
    expect(result.decision).toBe('allow');
    expect(result.specificity).toBe('login_gate');
    expect(result.appliedPolicyFlags).toContain('login_entitlement_ok');
  });

  it('denies login when no login_entitling guild membership exists', () => {
    const context = baseContext({
      guilds: [activeGuild(GUILD_A, { loginEntitling: false })],
      memberships: [membership(GUILD_A)],
    });

    const result = decideAuthorization(
      baseInput({ permissionId: LOGIN_PERMISSION, scope: ORG_SCOPE }),
      context,
    );
    expect(result.decision).toBe('deny');
    expect(result.specificity).toBe('login_gate');
    expect(result.appliedPolicyFlags).toContain('login_entitlement_missing');
  });

  it('denies login when entitling guild sync is stale beyond trust (login is sensitive)', () => {
    const staleAt = new Date(NOW.getTime() - (TRUST_WINDOW_SECONDS + 30) * 1000);
    const context = baseContext({
      guilds: [
        activeGuild(GUILD_A, {
          loginEntitling: true,
          syncStatus: 'stale',
          lastFreshAt: staleAt,
        }),
      ],
      memberships: [membership(GUILD_A)],
    });

    const result = decideAuthorization(
      baseInput({ permissionId: LOGIN_PERMISSION, scope: ORG_SCOPE }),
      context,
    );
    expect(result.decision).toBe('deny');
    expect(result.specificity).toBe('sync_gate');
    expect(result.syncStatus).toBe('stale');
    expect(
      result.appliedPolicyFlags.some((flag) => flag.startsWith('sensitive_requires_fresh')),
    ).toBe(true);
  });

  it('allows login when one entitling guild is fresh even if another is stale', () => {
    const staleAt = new Date(NOW.getTime() - (TRUST_WINDOW_SECONDS + 30) * 1000);
    const context = baseContext({
      guilds: [
        activeGuild(GUILD_A, {
          loginEntitling: true,
          syncStatus: 'stale',
          lastFreshAt: staleAt,
        }),
        activeGuild(GUILD_B, {
          loginEntitling: true,
          syncStatus: 'fresh',
          lastFreshAt: NOW,
        }),
      ],
      memberships: [membership(GUILD_A), membership(GUILD_B)],
      identityLinked: true,
    });

    const result = decideAuthorization(
      baseInput({ permissionId: LOGIN_PERMISSION, scope: ORG_SCOPE, operationClass: 'sensitive' }),
      context,
    );

    expect(result.decision).toBe('allow');
    expect(result.appliedPolicyFlags).toContain('login_guild:guild-b');
  });

  it('denies login when the only entitling guild has a guild-scoped block', () => {
    const context = baseContext({
      guilds: [activeGuild(GUILD_A, { loginEntitling: true })],
      memberships: [membership(GUILD_A)],
      identityLinked: true,
      blocks: [
        block({
          id: 'guild-block',
          scopeType: 'guild',
          scopeGuildId: GUILD_A,
          reason: 'guild quarantine',
        }),
      ],
    });

    const result = decideAuthorization(
      baseInput({ permissionId: LOGIN_PERMISSION, scope: ORG_SCOPE, operationClass: 'sensitive' }),
      context,
    );

    expect(result.decision).toBe('deny');
    expect(result.appliedPolicyFlags).toContain('guild_block:guild-a');
  });

  it('allows ordinary guild ops within the unavailable trust window when lastFreshAt is recent', () => {
    const recentFresh = new Date(NOW.getTime() - (TRUST_WINDOW_SECONDS - 10) * 1000);
    const context = baseContext({
      guilds: [activeGuild(GUILD_A, { syncStatus: 'unavailable', lastFreshAt: recentFresh })],
      grants: [grant({ id: 'allow-1', effect: 'allow', specificity: 'user' })],
    });

    const result = decideAuthorization(baseInput({ operationClass: 'ordinary' }), context);
    expect(result.decision).toBe('allow');
    expect(result.appliedPolicyFlags).toContain('ordinary_trust_window');
  });

  it('denies ordinary guild ops when stale data exceeds the trust window', () => {
    const staleAt = new Date(NOW.getTime() - (TRUST_WINDOW_SECONDS + 1) * 1000);
    const context = baseContext({
      guilds: [activeGuild(GUILD_A, { syncStatus: 'stale', lastFreshAt: staleAt })],
      grants: [grant({ id: 'allow', effect: 'allow', specificity: 'user' })],
    });

    const result = decideAuthorization(baseInput({ operationClass: 'ordinary' }), context);
    expect(result.decision).toBe('deny');
    expect(result.specificity).toBe('sync_gate');
    expect(result.appliedPolicyFlags).toContain('trust_window_expired_or_unavailable');
  });

  it('allows ordinary guild ops within the stale trust window', () => {
    const staleAt = new Date(NOW.getTime() - (TRUST_WINDOW_SECONDS - 10) * 1000);
    const context = baseContext({
      guilds: [activeGuild(GUILD_A, { syncStatus: 'stale', lastFreshAt: staleAt })],
      grants: [grant({ id: 'allow', effect: 'allow', specificity: 'user' })],
    });

    const result = decideAuthorization(baseInput({ operationClass: 'ordinary' }), context);
    expect(result.decision).toBe('allow');
    expect(result.appliedPolicyFlags).toContain('ordinary_trust_window');
  });
});

describe('decideAuthorization — temporary expiry', () => {
  it('ignores expired grants', () => {
    const context = baseContext({
      grants: [
        grant({
          id: 'expired-allow',
          effect: 'allow',
          specificity: 'user',
          expiresAt: new Date(NOW.getTime() - 1),
        }),
      ],
    });

    const result = decideAuthorization(baseInput(), context);
    expect(result.decision).toBe('deny');
    expect(result.reason).toBe('No matching allow rule');
  });

  it('ignores expired blocks so later allow can win', () => {
    const context = baseContext({
      blocks: [
        block({
          id: 'expired-block',
          reason: 'temporary ban',
          expiresAt: new Date(NOW.getTime() - 1),
        }),
      ],
      grants: [grant({ id: 'allow', effect: 'allow', specificity: 'user' })],
    });

    const result = decideAuthorization(baseInput(), context);
    expect(result.decision).toBe('allow');
    expect(result.winningRuleId).toBe('allow');
  });

  it('honors still-active temporary grants', () => {
    const context = baseContext({
      grants: [
        grant({
          id: 'temp-allow',
          effect: 'allow',
          specificity: 'user',
          expiresAt: new Date(NOW.getTime() + 60_000),
        }),
      ],
    });

    const result = decideAuthorization(baseInput(), context);
    expect(result.decision).toBe('allow');
    expect(result.winningRuleId).toBe('temp-allow');
  });
});
