import { getSharedTestFixtures, TEST_SERVICE_GATEWAY_ACTIVE_KID } from '@v2/internal-jwt';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildClientAssertion } from './build-client-assertion.js';
import {
  InternalJwtClientConfigError,
  parseInternalJwtClientEnv,
} from './internal-jwt-client-env.js';

describe('parseInternalJwtClientEnv', () => {
  it('returns defaults when client is disabled', () => {
    const config = parseInternalJwtClientEnv({});
    expect(config.INTERNAL_JWT_CLIENT_ENABLED).toBe(false);
  });

  it('requires all fields when enabled', () => {
    expect(() =>
      parseInternalJwtClientEnv({
        INTERNAL_JWT_CLIENT_ENABLED: 'true',
        INTERNAL_JWT_CLIENT_ID: 'v2.api-gateway',
      }),
    ).toThrow(InternalJwtClientConfigError);
  });
});

describe('buildClientAssertion', () => {
  let privatePem: string;

  beforeAll(async () => {
    const fixtures = await getSharedTestFixtures();
    privatePem = fixtures.TEST_SERVICE_GATEWAY_ACTIVE.privatePem;
  });

  it('builds a signed assertion JWT', async () => {
    const config = parseInternalJwtClientEnv({
      INTERNAL_JWT_CLIENT_ENABLED: 'true',
      INTERNAL_JWT_CLIENT_ID: 'v2.api-gateway',
      INTERNAL_JWT_CLIENT_PRIVATE_KEY_PEM: privatePem,
      INTERNAL_JWT_CLIENT_ACTIVE_KID: TEST_SERVICE_GATEWAY_ACTIVE_KID,
      INTERNAL_JWT_ASSERTION_AUD: 'http://127.0.0.1:4200/identity/internal-token',
      INTERNAL_JWT_IDENTITY_BASE_URL: 'http://127.0.0.1:4200',
      INTERNAL_JWT_JWKS_URL: 'http://127.0.0.1:4200/identity/.well-known/jwks.json',
      INTERNAL_JWT_ISSUER: 'http://127.0.0.1:4200',
      INTERNAL_JWT_DEFAULT_AUDIENCE: 'v2.api-gateway',
    });

    const assertion = await buildClientAssertion(config);
    expect(assertion.split('.')).toHaveLength(3);
  });
});
