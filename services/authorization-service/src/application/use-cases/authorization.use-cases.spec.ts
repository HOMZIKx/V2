import { describe, expect, it, vi } from 'vitest';

import type {
  AuthorizationStorePort,
  PendingSessionRevokeRecord,
  SessionRevokePort,
} from '../ports/authorization.ports.js';
import * as useCases from './authorization.use-cases.js';

function createStore(overrides: Partial<AuthorizationStorePort> = {}): AuthorizationStorePort {
  return {
    ensureOrganization: vi.fn(),
    ping: vi.fn(),
    bootstrapOwner: vi.fn(),
    upsertIdentityLink: vi.fn(),
    authorize: vi.fn(),
    registerGuild: vi.fn(),
    applyDiscordEvent: vi.fn(),
    reconcileGuild: vi.fn(),
    activateGuild: vi.fn(),
    setGuildLoginEntitling: vi.fn(),
    createGrant: vi.fn(),
    createBlock: vi.fn(),
    listPendingSessionRevokes: vi.fn().mockResolvedValue([]),
    markSessionRevokeDelivered: vi.fn(),
    markSessionRevokeAttemptFailed: vi.fn(),
    processExpiredPolicies: vi.fn(),
    ...overrides,
  };
}

function pending(overrides: Partial<PendingSessionRevokeRecord> = {}): PendingSessionRevokeRecord {
  return {
    id: 'revoke-1',
    v2UserId: 'user-a',
    correlationId: 'corr-1',
    reason: 'login_entitlement_lost',
    attempts: 0,
    ...overrides,
  };
}

describe('authorization use-cases', () => {
  it('bootstraps owner through the store port', async () => {
    const bootstrapOwner = vi.fn().mockResolvedValue({
      organizationId: 'org-1',
      ownerDiscordUserId: 'd1',
      bootstrapCompletedAt: '2026-08-05T00:00:00.000Z',
      alreadyCompleted: false,
    });
    const store = createStore({ bootstrapOwner });

    const result = await useCases.bootstrapOwner(store, { discordUserId: 'd1' });

    expect(bootstrapOwner).toHaveBeenCalledWith({ discordUserId: 'd1' });
    expect(result.alreadyCompleted).toBe(false);
  });

  it('drains the durable revoke queue after discord events and marks delivered', async () => {
    const applyDiscordEvent = vi.fn().mockResolvedValue({
      applied: true,
      duplicate: false,
      revokedUserIds: ['user-a', 'user-b'],
    });
    const listPendingSessionRevokes = vi
      .fn()
      .mockResolvedValue([
        pending({ id: 'r-a', v2UserId: 'user-a', correlationId: 'c-a' }),
        pending({ id: 'r-b', v2UserId: 'user-b', correlationId: 'c-b' }),
      ]);
    const markSessionRevokeDelivered = vi.fn().mockResolvedValue(undefined);
    const store = createStore({
      applyDiscordEvent,
      listPendingSessionRevokes,
      markSessionRevokeDelivered,
    });
    const revokeAllSessionsForUser = vi.fn().mockResolvedValue(undefined);
    const revoke: SessionRevokePort = { revokeAllSessionsForUser };

    const result = await useCases.applyDiscordEvent(store, revoke, {
      eventKey: 'evt-1',
      eventType: 'member_remove',
      discordGuildId: 'g1',
      payload: { kind: 'member_remove', discordUserId: 'd1' },
    });

    expect(result.revokedUserIds).toEqual(['user-a', 'user-b']);
    expect(revokeAllSessionsForUser).toHaveBeenCalledTimes(2);
    expect(revokeAllSessionsForUser).toHaveBeenNthCalledWith(
      1,
      'user-a',
      'c-a',
      'login_entitlement_lost',
    );
    expect(revokeAllSessionsForUser).toHaveBeenNthCalledWith(
      2,
      'user-b',
      'c-b',
      'login_entitlement_lost',
    );
    expect(markSessionRevokeDelivered).toHaveBeenCalledWith('r-a');
    expect(markSessionRevokeDelivered).toHaveBeenCalledWith('r-b');
  });

  it('drains pending revokes even when the mutation was a duplicate', async () => {
    const applyDiscordEvent = vi.fn().mockResolvedValue({
      applied: false,
      duplicate: true,
      revokedUserIds: [],
    });
    const listPendingSessionRevokes = vi
      .fn()
      .mockResolvedValue([pending({ id: 'stale', v2UserId: 'user-a', correlationId: 'c-stale' })]);
    const markSessionRevokeDelivered = vi.fn().mockResolvedValue(undefined);
    const store = createStore({
      applyDiscordEvent,
      listPendingSessionRevokes,
      markSessionRevokeDelivered,
    });
    const revokeAllSessionsForUser = vi.fn().mockResolvedValue(undefined);

    const result = await useCases.applyDiscordEvent(
      store,
      { revokeAllSessionsForUser },
      {
        eventKey: 'evt-1',
        eventType: 'member_remove',
        discordGuildId: 'g1',
        payload: { kind: 'member_remove', discordUserId: 'd1' },
      },
    );

    expect(result.duplicate).toBe(true);
    expect(revokeAllSessionsForUser).toHaveBeenCalledWith(
      'user-a',
      'c-stale',
      'login_entitlement_lost',
    );
    expect(markSessionRevokeDelivered).toHaveBeenCalledWith('stale');
  });

  it('records a failed attempt and keeps the row pending when Identity revoke fails', async () => {
    const listPendingSessionRevokes = vi
      .fn()
      .mockResolvedValue([pending({ id: 'r-1', v2UserId: 'user-a', correlationId: 'c-1' })]);
    const markSessionRevokeDelivered = vi.fn().mockResolvedValue(undefined);
    const markSessionRevokeAttemptFailed = vi.fn().mockResolvedValue(undefined);
    const store = createStore({
      listPendingSessionRevokes,
      markSessionRevokeDelivered,
      markSessionRevokeAttemptFailed,
    });
    const revokeAllSessionsForUser = vi.fn().mockRejectedValue(new Error('identity down'));

    const summary = await useCases.deliverPendingRevokes(store, { revokeAllSessionsForUser });

    expect(summary).toEqual({ delivered: 0, failed: 1 });
    expect(markSessionRevokeDelivered).not.toHaveBeenCalled();
    expect(markSessionRevokeAttemptFailed).toHaveBeenCalledWith('r-1', 'identity down');
  });

  it('skips revoke when the revoke port is null', async () => {
    const reconcileGuild = vi.fn().mockResolvedValue({
      applied: true,
      duplicate: false,
      revokedUserIds: ['user-a'],
    });
    const listPendingSessionRevokes = vi.fn();
    const store = createStore({ reconcileGuild, listPendingSessionRevokes });

    await expect(
      useCases.reconcileGuild(store, null, {
        discordGuildId: 'g1',
        members: [],
        roles: [],
      }),
    ).resolves.toMatchObject({ applied: true });
    expect(listPendingSessionRevokes).not.toHaveBeenCalled();
  });

  it('activates guild and drains the revoke queue', async () => {
    const activateGuild = vi.fn().mockResolvedValue({
      guild: {
        discordGuildId: 'g1',
        status: 'active',
        loginEntitling: false,
        syncStatus: 'fresh',
      },
      revokedUserIds: ['user-z'],
    });
    const listPendingSessionRevokes = vi
      .fn()
      .mockResolvedValue([pending({ id: 'r-z', v2UserId: 'user-z', correlationId: 'c-z' })]);
    const store = createStore({ activateGuild, listPendingSessionRevokes });
    const revokeAllSessionsForUser = vi.fn().mockResolvedValue(undefined);

    await useCases.activateGuild(
      store,
      { revokeAllSessionsForUser },
      { discordGuildId: 'g1', actor: { v2UserId: 'owner' } },
    );

    expect(revokeAllSessionsForUser).toHaveBeenCalledWith(
      'user-z',
      'c-z',
      'login_entitlement_lost',
    );
  });

  it('sets guild login entitling and drains the revoke queue', async () => {
    const setGuildLoginEntitling = vi.fn().mockResolvedValue({
      guild: {
        discordGuildId: 'g1',
        status: 'active',
        loginEntitling: false,
        syncStatus: 'fresh',
      },
      revokedUserIds: ['user-y'],
    });
    const listPendingSessionRevokes = vi
      .fn()
      .mockResolvedValue([pending({ id: 'r-y', v2UserId: 'user-y', correlationId: 'c-y' })]);
    const store = createStore({ setGuildLoginEntitling, listPendingSessionRevokes });
    const revokeAllSessionsForUser = vi.fn().mockResolvedValue(undefined);

    await useCases.setGuildLoginEntitling(
      store,
      { revokeAllSessionsForUser },
      { discordGuildId: 'g1', loginEntitling: false, actor: { v2UserId: 'owner' } },
    );

    expect(revokeAllSessionsForUser).toHaveBeenCalledWith(
      'user-y',
      'c-y',
      'login_entitlement_lost',
    );
  });

  it('creates a grant and drains affected sessions', async () => {
    const createGrant = vi.fn().mockResolvedValue({ id: 'grant-1', revokedUserIds: ['user-x'] });
    const listPendingSessionRevokes = vi
      .fn()
      .mockResolvedValue([
        pending({
          id: 'r-x',
          v2UserId: 'user-x',
          correlationId: 'c-x',
          reason: 'login_entitlement_lost',
        }),
      ]);
    const store = createStore({ createGrant, listPendingSessionRevokes });
    const revokeAllSessionsForUser = vi.fn().mockResolvedValue(undefined);

    const result = await useCases.createGrant(
      store,
      { revokeAllSessionsForUser },
      {
        effect: 'deny',
        permissionId: 'permission.platform.login.www',
        v2UserId: 'user-x',
        scopeType: 'organization',
        actor: { v2UserId: 'owner' },
      },
    );

    expect(result.id).toBe('grant-1');
    expect(revokeAllSessionsForUser).toHaveBeenCalledWith(
      'user-x',
      'c-x',
      'login_entitlement_lost',
    );
  });

  it('creates a block and drains affected sessions', async () => {
    const createBlock = vi.fn().mockResolvedValue({ id: 'block-1', revokedUserIds: ['user-b'] });
    const listPendingSessionRevokes = vi
      .fn()
      .mockResolvedValue([pending({ id: 'r-b', v2UserId: 'user-b', correlationId: 'c-b' })]);
    const store = createStore({ createBlock, listPendingSessionRevokes });
    const revokeAllSessionsForUser = vi.fn().mockResolvedValue(undefined);

    await useCases.createBlock(
      store,
      { revokeAllSessionsForUser },
      {
        v2UserId: 'user-b',
        scopeType: 'global',
        reason: 'abuse',
        actor: { v2UserId: 'owner' },
      },
    );

    expect(revokeAllSessionsForUser).toHaveBeenCalledWith(
      'user-b',
      'c-b',
      'login_entitlement_lost',
    );
  });

  it('processes expired policies and drains affected sessions', async () => {
    const processExpiredPolicies = vi.fn().mockResolvedValue({ revokedUserIds: ['user-w'] });
    const listPendingSessionRevokes = vi
      .fn()
      .mockResolvedValue([
        pending({ id: 'r-w', v2UserId: 'user-w', correlationId: 'c-w', reason: 'policy_expired' }),
      ]);
    const store = createStore({ processExpiredPolicies, listPendingSessionRevokes });
    const revokeAllSessionsForUser = vi.fn().mockResolvedValue(undefined);

    await useCases.processExpiredPolicies(store, { revokeAllSessionsForUser });

    expect(revokeAllSessionsForUser).toHaveBeenCalledWith('user-w', 'c-w', 'policy_expired');
  });

  it('authorize and explain both call store.authorize', async () => {
    const authorize = vi.fn().mockResolvedValue({
      decision: 'allow',
      permissionId: 'permission.platform.login.www',
      scope: { type: 'organization' },
      appliedPolicyFlags: [],
      reason: 'ok',
    });
    const store = createStore({ authorize });
    const command = {
      subject: { v2UserId: 'u1' },
      permissionId: 'permission.platform.login.www',
      scope: { type: 'organization' as const },
      operationClass: 'sensitive' as const,
    };

    await useCases.authorize(store, command);
    await useCases.explainAuthorization(store, command);

    expect(authorize).toHaveBeenCalledTimes(2);
  });
});
