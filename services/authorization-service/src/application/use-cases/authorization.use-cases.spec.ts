import { describe, expect, it, vi } from 'vitest';

import type {
  AuthorizationStorePort,
  SessionRevokePort,
} from '../ports/authorization.ports.js';
import * as useCases from './authorization.use-cases.js';

function createStore(
  overrides: Partial<AuthorizationStorePort> = {},
): AuthorizationStorePort {
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
    createGrant: vi.fn(),
    createBlock: vi.fn(),
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

  it('revokes sessions for users who lost login entitlement after discord events', async () => {
    const applyDiscordEvent = vi.fn().mockResolvedValue({
      applied: true,
      duplicate: false,
      revokedUserIds: ['user-a', 'user-b'],
    });
    const store = createStore({ applyDiscordEvent });
    const revokeAllSessionsForUser = vi.fn().mockResolvedValue(undefined);
    const revoke: SessionRevokePort = { revokeAllSessionsForUser };

    const result = await useCases.applyDiscordEvent(
      store,
      revoke,
      {
        eventKey: 'evt-1',
        eventType: 'member_remove',
        discordGuildId: 'g1',
        payload: { kind: 'member_remove', discordUserId: 'd1' },
      },
    );

    expect(result.revokedUserIds).toEqual(['user-a', 'user-b']);
    expect(revokeAllSessionsForUser).toHaveBeenCalledTimes(2);
    expect(revokeAllSessionsForUser).toHaveBeenNthCalledWith(1, 'user-a');
    expect(revokeAllSessionsForUser).toHaveBeenNthCalledWith(2, 'user-b');
  });

  it('skips revoke when the revoke port is null', async () => {
    const reconcileGuild = vi.fn().mockResolvedValue({
      applied: true,
      duplicate: false,
      revokedUserIds: ['user-a'],
    });
    const store = createStore({ reconcileGuild });

    await expect(
      useCases.reconcileGuild(store, null, {
        discordGuildId: 'g1',
        members: [],
        roles: [],
      }),
    ).resolves.toMatchObject({ applied: true });
  });

  it('activates guild and forwards revoke list', async () => {
    const activateGuild = vi.fn().mockResolvedValue({
      guild: {
        discordGuildId: 'g1',
        status: 'active',
        loginEntitling: false,
        syncStatus: 'fresh',
      },
      revokedUserIds: ['user-z'],
    });
    const store = createStore({ activateGuild });
    const revokeAllSessionsForUser = vi.fn().mockResolvedValue(undefined);

    await useCases.activateGuild(
      store,
      { revokeAllSessionsForUser },
      { discordGuildId: 'g1', loginEntitling: false },
    );

    expect(revokeAllSessionsForUser).toHaveBeenCalledWith('user-z');
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
