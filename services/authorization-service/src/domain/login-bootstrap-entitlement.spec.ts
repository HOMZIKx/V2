import { describe, expect, it } from 'vitest';

import {
  decideAuthorization,
  type AuthorizeContext,
  type AuthorizeInput,
  type ConnectedGuildState,
  type MembershipState,
} from './decision-engine.js';

const NOW = new Date('2026-09-07T18:05:00.000Z');
const GUILD_ID = '1543972927719080016';

function loginInput(): AuthorizeInput {
  return {
    subject: {
      v2UserId: 'user-v2',
      discordUserId: '808080808080808080',
    },
    permissionId: 'permission.platform.login.www',
    scope: { type: 'organization' },
    operationClass: 'sensitive',
    now: NOW,
    trustWindowSeconds: 120,
  };
}

function membership(): MembershipState {
  return {
    discordGuildId: GUILD_ID,
    discordUserId: '808080808080808080',
    v2UserId: 'user-v2',
    status: 'active',
    roleIds: [],
  };
}

function context(guild: ConnectedGuildState): AuthorizeContext {
  return {
    blocks: [],
    grants: [],
    mappedPermissions: [],
    memberships: [membership()],
    guilds: [guild],
    identityLinked: true,
  };
}

describe('fresh pending guild login bootstrap entitlement', () => {
  it('allows an existing member immediately after authenticated gateway reconcile', () => {
    const result = decideAuthorization(
      loginInput(),
      context({
        discordGuildId: GUILD_ID,
        status: 'pending_sync',
        loginEntitling: false,
        syncStatus: 'fresh',
        lastFreshAt: NOW,
      }),
    );

    expect(result.decision).toBe('allow');
    expect(result.appliedPolicyFlags).toContain('login_entitlement_ok');
    expect(result.appliedPolicyFlags).toContain(`login_guild:${GUILD_ID}`);
  });

  it('does not allow a pending guild whose membership snapshot is unavailable', () => {
    const result = decideAuthorization(
      loginInput(),
      context({
        discordGuildId: GUILD_ID,
        status: 'pending_sync',
        loginEntitling: false,
        syncStatus: 'unavailable',
      }),
    );

    expect(result.decision).toBe('deny');
    expect(result.appliedPolicyFlags).toContain('login_entitlement_missing');
  });

  it('still respects an explicit active non-entitling policy', () => {
    const result = decideAuthorization(
      loginInput(),
      context({
        discordGuildId: GUILD_ID,
        status: 'active',
        loginEntitling: false,
        syncStatus: 'fresh',
        lastFreshAt: NOW,
      }),
    );

    expect(result.decision).toBe('deny');
    expect(result.appliedPolicyFlags).toContain('login_entitlement_missing');
  });
});
