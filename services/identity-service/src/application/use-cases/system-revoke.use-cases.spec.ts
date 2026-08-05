import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IdentityError } from '../../domain/errors.js';
import type { IdentitySessionPort } from '../ports/identity.ports.js';
import type { ClientAssertionPort } from '../ports/internal-token.ports.js';
import { revokeSessionsForUserSystem } from './system-revoke.use-cases.js';

describe('revokeSessionsForUserSystem', () => {
  const verify = vi.fn<ClientAssertionPort['verify']>();
  const assertJtiOnce = vi.fn<ClientAssertionPort['assertJtiOnce']>();
  const revokeAllSessionsForUser = vi.fn<IdentitySessionPort['revokeAllSessionsForUser']>();

  const sessionPort: IdentitySessionPort = {
    getMe: vi.fn(),
    listAccounts: vi.fn(),
    startLink: vi.fn(),
    unlinkAccount: vi.fn(),
    logoutCurrent: vi.fn(),
    logoutAll: vi.fn(),
    revokeAllSessionsForUser,
  };

  const assertionPort: ClientAssertionPort = {
    verify,
    assertJtiOnce,
    assertAudienceAllowed: vi.fn(),
  };

  const revokeUrl = 'http://127.0.0.1:4200/identity/v1/system/revoke-sessions';
  const userId = randomUUID();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects missing client assertion', async () => {
    await expect(
      revokeSessionsForUserSystem(sessionPort, assertionPort, {
        clientAssertion: undefined,
        expectedAudience: revokeUrl,
        assertionReplayTtlSeconds: 120,
        v2UserId: userId,
        reason: 'membership lost',
        correlationId: 'corr-1',
      }),
    ).rejects.toMatchObject({ code: 'CLIENT_ASSERTION_INVALID' });

    expect(verify).not.toHaveBeenCalled();
    expect(revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it('rejects user-jwt-only path (no assertion, even with a user id present)', async () => {
    await expect(
      revokeSessionsForUserSystem(sessionPort, assertionPort, {
        clientAssertion: '',
        expectedAudience: revokeUrl,
        assertionReplayTtlSeconds: 120,
        v2UserId: userId,
        reason: 'admin action',
        correlationId: 'corr-2',
      }),
    ).rejects.toBeInstanceOf(IdentityError);

    expect(verify).not.toHaveBeenCalled();
    expect(revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it('accepts a valid assertion and revokes sessions', async () => {
    verify.mockResolvedValue({
      clientId: 'v2.authorization-service',
      kid: 'kid',
      jti: randomUUID(),
    });

    const result = await revokeSessionsForUserSystem(sessionPort, assertionPort, {
      clientAssertion: 'valid-assertion',
      expectedAudience: revokeUrl,
      assertionReplayTtlSeconds: 120,
      v2UserId: userId,
      reason: 'membership lost',
      correlationId: 'corr-3',
    });

    expect(result).toEqual({
      status: 'ok',
      revoked_user_id: userId,
      correlation_id: 'corr-3',
    });
    expect(verify).toHaveBeenCalledWith('valid-assertion', revokeUrl);
    expect(assertJtiOnce).toHaveBeenCalled();
    expect(revokeAllSessionsForUser).toHaveBeenCalledWith(userId);
  });

  it('rejects replayed assertion jti before revoke', async () => {
    verify.mockResolvedValue({
      clientId: 'v2.authorization-service',
      kid: 'kid',
      jti: randomUUID(),
    });
    assertJtiOnce.mockRejectedValue(
      new IdentityError('CLIENT_ASSERTION_REPLAY', 'Client assertion jti was already used'),
    );

    await expect(
      revokeSessionsForUserSystem(sessionPort, assertionPort, {
        clientAssertion: 'replayed-assertion',
        expectedAudience: revokeUrl,
        assertionReplayTtlSeconds: 120,
        v2UserId: userId,
        reason: 'membership lost',
        correlationId: 'corr-4',
      }),
    ).rejects.toMatchObject({ code: 'CLIENT_ASSERTION_REPLAY' });

    expect(revokeAllSessionsForUser).not.toHaveBeenCalled();
  });
});
