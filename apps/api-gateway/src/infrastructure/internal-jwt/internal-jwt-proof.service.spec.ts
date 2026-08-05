import {
  getSharedTestFixtures,
  TEST_SERVICE_GATEWAY_ACTIVE_KID,
  verifyInternalJwt,
} from '@v2/internal-jwt';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { InternalJwtClientEnv } from './internal-jwt-client-env.js';
import { InternalJwtProofService } from './internal-jwt-proof.service.js';

vi.mock('@v2/internal-jwt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@v2/internal-jwt')>();
  return {
    ...actual,
    verifyInternalJwt: vi.fn(),
  };
});

describe('InternalJwtProofService', () => {
  let config: InternalJwtClientEnv;

  beforeAll(async () => {
    const fixtures = await getSharedTestFixtures();
    config = {
      INTERNAL_JWT_CLIENT_ENABLED: true,
      INTERNAL_JWT_CLIENT_ID: 'v2.api-gateway',
      INTERNAL_JWT_CLIENT_PRIVATE_KEY_PEM: fixtures.TEST_SERVICE_GATEWAY_ACTIVE.privatePem,
      INTERNAL_JWT_CLIENT_ACTIVE_KID: TEST_SERVICE_GATEWAY_ACTIVE_KID,
      INTERNAL_JWT_ASSERTION_AUD: 'http://127.0.0.1:4200/identity/internal-token',
      INTERNAL_JWT_IDENTITY_BASE_URL: 'http://127.0.0.1:4200',
      INTERNAL_JWT_JWKS_URL: 'http://127.0.0.1:4200/identity/.well-known/jwks.json',
      INTERNAL_JWT_ISSUER: 'http://127.0.0.1:4200',
      INTERNAL_JWT_DEFAULT_AUDIENCE: 'v2.api-gateway',
    };
  });

  it('issues and verifies without returning the raw token', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'signed-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            keys: [{ kid: 'internal-active', kty: 'OKP', crv: 'Ed25519', x: 'abc', alg: 'EdDSA' }],
          }),
      });

    vi.mocked(verifyInternalJwt).mockResolvedValue({
      sub: 'user-42',
      jti: 'jti',
      exp: 9_999_999_999,
      kid: 'internal-active',
    });

    const service = new InternalJwtProofService(config, fetchImpl);
    const result = await service.proveIssueAndVerify('session=abc');

    expect(result).toEqual({ ok: true, sub: 'user-42' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const issueCall = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = issueCall.headers as Record<string, string>;
    expect(headers.cookie).toBe('session=abc');
    expect(headers['identity-client-assertion']).toEqual(expect.any(String));
    expect(JSON.stringify(result)).not.toContain('signed-token');
  });
});
