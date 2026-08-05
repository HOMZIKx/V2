import { describe, expect, it, vi } from 'vitest';

import { IdentityError } from '../../domain/errors.js';
import type { IdentitySessionPort } from '../ports/identity.ports.js';
import type { ClientAssertionPort, InternalJwtIssuePort } from '../ports/internal-token.ports.js';
import { issueInternalToken } from './internal-token.use-cases.js';

describe('issueInternalToken', () => {
  const verify = vi.fn<ClientAssertionPort['verify']>();
  const assertJtiOnce = vi.fn<ClientAssertionPort['assertJtiOnce']>();
  const assertAudienceAllowed = vi.fn<ClientAssertionPort['assertAudienceAllowed']>();
  const getMe = vi.fn<IdentitySessionPort['getMe']>();
  const issue = vi.fn<InternalJwtIssuePort['issue']>();

  const sessionPort: IdentitySessionPort = {
    getMe,
    listAccounts: vi.fn(),
    startLink: vi.fn(),
    unlinkAccount: vi.fn(),
    logoutCurrent: vi.fn(),
    logoutAll: vi.fn(),
    revokeAllSessionsForUser: vi.fn(),
  };

  const assertionPort: ClientAssertionPort = {
    verify,
    assertJtiOnce,
    assertAudienceAllowed,
  };

  const issuePort: InternalJwtIssuePort = {
    issue,
    getJwks: vi.fn(),
  };

  it('issues when assertion, session, and audience are valid', async () => {
    verify.mockResolvedValue({
      clientId: 'v2.api-gateway',
      kid: 'kid',
      jti: 'jti-1',
    });
    getMe.mockResolvedValue({
      id: 'user-1',
      email: 'u@example.com',
      name: 'User',
      emailVerified: true,
      emailSynthetic: false,
      image: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    issue.mockResolvedValue({
      accessToken: 'token',
      tokenType: 'Bearer',
      expiresInSeconds: 300,
    });

    const result = await issueInternalToken(sessionPort, assertionPort, issuePort, {
      clientAssertion: 'assertion',
      userSessionHeaders: new Headers(),
      audience: 'v2.api-gateway',
      assertionReplayTtlSeconds: 120,
    });

    expect(result.accessToken).toBe('token');
    expect(assertJtiOnce).toHaveBeenCalledWith('jti-1', 120);
  });

  it('rejects without session', async () => {
    verify.mockResolvedValue({
      clientId: 'v2.api-gateway',
      kid: 'kid',
      jti: 'jti-2',
    });
    getMe.mockResolvedValue(null);

    await expect(
      issueInternalToken(sessionPort, assertionPort, issuePort, {
        clientAssertion: 'assertion',
        userSessionHeaders: new Headers(),
        audience: 'v2.api-gateway',
        assertionReplayTtlSeconds: 120,
      }),
    ).rejects.toBeInstanceOf(IdentityError);
  });
});
