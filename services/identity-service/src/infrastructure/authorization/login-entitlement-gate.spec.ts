import { APIError } from 'better-auth';
import { describe, expect, it, vi } from 'vitest';

import { IdentityError } from '../../domain/errors.js';
import type { AuthorizationClient } from './authorization-client.js';
import { enforceLoginEntitlement } from './login-entitlement-gate.js';

describe('enforceLoginEntitlement', () => {
  it('denies when no Discord account is linked', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const upsertIdentityLink = vi.fn();
    const authorizeWwwLogin = vi.fn();
    const authorizationClient: AuthorizationClient = {
      upsertIdentityLink,
      authorizeWwwLogin,
    };

    await expect(
      enforceLoginEntitlement({
        pool: pool as never,
        authorizationClient,
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(APIError);

    expect(upsertIdentityLink).not.toHaveBeenCalled();
  });

  it('denies when Authz returns deny and does not throw after link', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ accountId: 'discord-1' }] }),
    };
    const upsertIdentityLink = vi.fn().mockResolvedValue(undefined);
    const authorizeWwwLogin = vi.fn().mockResolvedValue('deny');
    const authorizationClient: AuthorizationClient = {
      upsertIdentityLink,
      authorizeWwwLogin,
    };

    try {
      await enforceLoginEntitlement({
        pool: pool as never,
        authorizationClient,
        userId: 'user-1',
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).body).toEqual(
        expect.objectContaining({ code: 'LOGIN_NOT_ENTITLED' }),
      );
    }

    expect(upsertIdentityLink).toHaveBeenCalledWith({
      discordUserId: 'discord-1',
      v2UserId: 'user-1',
    });
  });

  it('allows when Authz returns allow', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ accountId: 'discord-1' }] }),
    };
    const authorizationClient: AuthorizationClient = {
      upsertIdentityLink: vi.fn().mockResolvedValue(undefined),
      authorizeWwwLogin: vi.fn().mockResolvedValue('allow'),
    };

    await expect(
      enforceLoginEntitlement({
        pool: pool as never,
        authorizationClient,
        userId: 'user-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('maps Authorization outage to SERVICE_UNAVAILABLE', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ accountId: 'discord-1' }] }),
    };
    const authorizationClient: AuthorizationClient = {
      upsertIdentityLink: vi
        .fn()
        .mockRejectedValue(new IdentityError('AUTHORIZATION_UNAVAILABLE', 'down')),
      authorizeWwwLogin: vi.fn(),
    };

    await expect(
      enforceLoginEntitlement({
        pool: pool as never,
        authorizationClient,
        userId: 'user-1',
      }),
    ).rejects.toMatchObject({
      body: { code: 'AUTHORIZATION_UNAVAILABLE' },
    });
  });
});
