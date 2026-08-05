import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { IdentityError } from '../../domain/errors.js';
import {
  assertAudienceAllowedForClient,
  verifyClientAssertion,
} from './client-assertion-verifier.js';
import { loadServiceClientRegistry } from './service-client-registry.js';
import { signTestClientAssertion } from './sign-test-client-assertion.js';
import {
  buildTestServiceClientsJson,
  getIdentityTestFixtures,
  TEST_GATEWAY_AUDIENCE,
  TEST_GATEWAY_CLIENT_ID,
  TEST_INTERNAL_JWT_ISSUE_URL,
  TEST_OTHER_AUDIENCE,
  TEST_OTHER_CLIENT_ID,
  type IdentityInternalJwtTestFixtures,
} from './test-fixtures.js';

const baseConfig = {
  IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS: 60,
  IDENTITY_CLIENT_ASSERTION_CLOCK_SKEW_SECONDS: 60,
} as const;

const issueAudience = TEST_INTERNAL_JWT_ISSUE_URL;

describe('verifyClientAssertion', () => {
  let fixtures: IdentityInternalJwtTestFixtures;

  beforeAll(async () => {
    fixtures = await getIdentityTestFixtures();
  });

  it('accepts a valid assertion', async () => {
    const registry = await loadServiceClientRegistry(await buildTestServiceClientsJson());
    const assertion = await signTestClientAssertion({ config: baseConfig });

    const verified = await verifyClientAssertion(assertion, baseConfig, registry, issueAudience);
    expect(verified.clientId).toBe(TEST_GATEWAY_CLIENT_ID);
    expect(verified.kid).toBe(fixtures.TEST_SERVICE_GATEWAY_ACTIVE.kid);
    expect(verified.jti).toEqual(expect.any(String));
  });

  it('rejects iss !== sub', async () => {
    const registry = await loadServiceClientRegistry(await buildTestServiceClientsJson());
    const assertion = await signTestClientAssertion({
      config: baseConfig,
      iss: TEST_GATEWAY_CLIENT_ID,
      sub: 'v2.other',
    });

    await expect(verifyClientAssertion(assertion, baseConfig, registry, issueAudience)).rejects.toMatchObject({
      code: 'CLIENT_ASSERTION_INVALID',
    });
  });

  it('rejects cross-client impersonation (A signs, claims B, requests B audience)', async () => {
    const registry = await loadServiceClientRegistry(await buildTestServiceClientsJson());
    const assertion = await signTestClientAssertion({
      config: baseConfig,
      privatePem: fixtures.TEST_SERVICE_GATEWAY_ACTIVE.privatePem,
      kid: fixtures.TEST_SERVICE_GATEWAY_ACTIVE.kid,
      iss: TEST_OTHER_CLIENT_ID,
      sub: TEST_OTHER_CLIENT_ID,
    });

    await expect(verifyClientAssertion(assertion, baseConfig, registry, issueAudience)).rejects.toMatchObject({
      code: 'CLIENT_ASSERTION_INVALID',
    });

    await expect(async () => {
      const verified = await verifyClientAssertion(assertion, baseConfig, registry, issueAudience);
      assertAudienceAllowedForClient(registry, verified.clientId, TEST_OTHER_AUDIENCE);
    }).rejects.toBeInstanceOf(IdentityError);
  });

  it('rejects key belonging to another client even with matching forged claims path', async () => {
    const registry = await loadServiceClientRegistry(await buildTestServiceClientsJson());
    const assertion = await signTestClientAssertion({
      config: baseConfig,
      privatePem: fixtures.TEST_SERVICE_OTHER_ACTIVE.privatePem,
      kid: fixtures.TEST_SERVICE_OTHER_ACTIVE.kid,
      iss: TEST_GATEWAY_CLIENT_ID,
      sub: TEST_GATEWAY_CLIENT_ID,
    });

    await expect(verifyClientAssertion(assertion, baseConfig, registry, issueAudience)).rejects.toMatchObject({
      code: 'CLIENT_ASSERTION_INVALID',
    });
  });

  it('rejects wrong assertion audience', async () => {
    const registry = await loadServiceClientRegistry(await buildTestServiceClientsJson());
    const assertion = await signTestClientAssertion({
      config: baseConfig,
      audience: 'https://evil.example/token',
    });

    await expect(verifyClientAssertion(assertion, baseConfig, registry, issueAudience)).rejects.toBeInstanceOf(
      IdentityError,
    );
  });

  it('rejects audience as array even when it contains the issue URL', async () => {
    const registry = await loadServiceClientRegistry(await buildTestServiceClientsJson());
    const assertion = await signTestClientAssertion({
      config: baseConfig,
      audience: [TEST_INTERNAL_JWT_ISSUE_URL, 'https://evil.example'],
    });

    await expect(verifyClientAssertion(assertion, baseConfig, registry, issueAudience)).rejects.toMatchObject({
      code: 'CLIENT_ASSERTION_INVALID',
    });
  });

  it('rejects iat far in the future', async () => {
    const registry = await loadServiceClientRegistry(await buildTestServiceClientsJson());
    const assertion = await signTestClientAssertion({
      config: baseConfig,
      issuedAtSeconds: Math.floor(Date.now() / 1000) + 3600,
      expiresInSeconds: 60,
    });

    await expect(verifyClientAssertion(assertion, baseConfig, registry, issueAudience)).rejects.toMatchObject({
      code: 'CLIENT_ASSERTION_INVALID',
    });
  });

  it('rejects invalid UUID jti', async () => {
    const registry = await loadServiceClientRegistry(await buildTestServiceClientsJson());
    const assertion = await signTestClientAssertion({
      config: baseConfig,
      jti: 'not-a-uuid',
    });

    await expect(verifyClientAssertion(assertion, baseConfig, registry, issueAudience)).rejects.toMatchObject({
      code: 'CLIENT_ASSERTION_INVALID',
    });
  });

  it('rejects bad signature', async () => {
    const registry = await loadServiceClientRegistry(await buildTestServiceClientsJson());
    const assertion = await signTestClientAssertion({
      config: baseConfig,
      privatePem: fixtures.TEST_SERVICE_OTHER_ACTIVE.privatePem,
      kid: fixtures.TEST_SERVICE_GATEWAY_ACTIVE.kid,
      iss: TEST_GATEWAY_CLIENT_ID,
      sub: TEST_GATEWAY_CLIENT_ID,
    });

    await expect(verifyClientAssertion(assertion, baseConfig, registry, issueAudience)).rejects.toBeInstanceOf(
      IdentityError,
    );
  });

  it('rejects wrong algorithm', async () => {
    const registry = await loadServiceClientRegistry(await buildTestServiceClientsJson());
    const token = await new SignJWT({ jti: randomUUID() })
      .setProtectedHeader({
        alg: 'HS256',
        kid: fixtures.TEST_SERVICE_GATEWAY_ACTIVE.kid,
      })
      .setIssuer(TEST_GATEWAY_CLIENT_ID)
      .setSubject(TEST_GATEWAY_CLIENT_ID)
      .setAudience(TEST_INTERNAL_JWT_ISSUE_URL)
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(new TextEncoder().encode('hmac-secret-for-wrong-alg-test'));

    await expect(verifyClientAssertion(token, baseConfig, registry, issueAudience)).rejects.toMatchObject({
      code: 'CLIENT_ASSERTION_INVALID',
    });
  });

  it('rejects missing required claims', async () => {
    const registry = await loadServiceClientRegistry(await buildTestServiceClientsJson());
    const assertion = await signTestClientAssertion({
      config: baseConfig,
      omitClaim: 'jti',
    });

    await expect(verifyClientAssertion(assertion, baseConfig, registry, issueAudience)).rejects.toMatchObject({
      code: 'CLIENT_ASSERTION_INVALID',
    });
  });

  it('rejects expired assertion', async () => {
    const registry = await loadServiceClientRegistry(await buildTestServiceClientsJson());
    const assertion = await signTestClientAssertion({
      config: baseConfig,
      expiresInSeconds: -120,
    });

    await expect(verifyClientAssertion(assertion, baseConfig, registry, issueAudience)).rejects.toBeInstanceOf(
      IdentityError,
    );
  });

  it('rejects unknown kid', async () => {
    const registry = await loadServiceClientRegistry(await buildTestServiceClientsJson());
    const assertion = await signTestClientAssertion({
      config: baseConfig,
      kid: 'unknown-kid',
    });

    await expect(verifyClientAssertion(assertion, baseConfig, registry, issueAudience)).rejects.toBeInstanceOf(
      IdentityError,
    );
  });

  it('accepts retiring key for verification', async () => {
    const registry = await loadServiceClientRegistry(await buildTestServiceClientsJson());
    const assertion = await signTestClientAssertion({
      config: baseConfig,
      kid: fixtures.TEST_SERVICE_GATEWAY_RETIRING.kid,
      privatePem: fixtures.TEST_SERVICE_GATEWAY_RETIRING.privatePem,
    });

    const verified = await verifyClientAssertion(assertion, baseConfig, registry, issueAudience);
    expect(verified.kid).toBe(fixtures.TEST_SERVICE_GATEWAY_RETIRING.kid);
  });

  it('accepts a caller-supplied expected audience (system revoke URL)', async () => {
    const registry = await loadServiceClientRegistry(await buildTestServiceClientsJson());
    const revokeUrl = 'http://127.0.0.1:4200/identity/v1/system/revoke-sessions';
    const assertion = await signTestClientAssertion({
      config: baseConfig,
      clientId: 'v2.authorization-service',
      kid: fixtures.TEST_SERVICE_AUTHZ_ACTIVE.kid,
      privatePem: fixtures.TEST_SERVICE_AUTHZ_ACTIVE.privatePem,
      audience: revokeUrl,
    });

    const verified = await verifyClientAssertion(assertion, baseConfig, registry, revokeUrl);
    expect(verified.clientId).toBe('v2.authorization-service');
  });
});

describe('assertAudienceAllowedForClient', () => {
  it('allows only registered audiences for the owning client', async () => {
    const registry = await loadServiceClientRegistry(await buildTestServiceClientsJson());
    expect(() =>
      assertAudienceAllowedForClient(registry, TEST_GATEWAY_CLIENT_ID, TEST_GATEWAY_AUDIENCE),
    ).not.toThrow();
    expect(() =>
      assertAudienceAllowedForClient(registry, TEST_GATEWAY_CLIENT_ID, TEST_OTHER_AUDIENCE),
    ).toThrow(IdentityError);
    expect(() =>
      assertAudienceAllowedForClient(registry, TEST_OTHER_CLIENT_ID, TEST_OTHER_AUDIENCE),
    ).not.toThrow();
  });
});
