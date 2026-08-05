import { decodeJwt } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import type { IdentityEnv } from '../config/identity-env.js';
import { loadInternalJwtKeyring } from './internal-jwt-keyring.js';
import { signInternalJwt } from './internal-jwt-signer.js';
import {
  buildTestInternalJwtKeyringJson,
  getIdentityTestFixtures,
  TEST_GATEWAY_AUDIENCE,
  TEST_INTERNAL_JWT_ISSUER,
} from './test-fixtures.js';

describe('signInternalJwt', () => {
  it('signs with active kid and omits email, roles, permissions, discord, session id', async () => {
    const fixtures = await getIdentityTestFixtures();
    const keyring = await loadInternalJwtKeyring(
      await buildTestInternalJwtKeyringJson(),
      fixtures.TEST_INTERNAL_ACTIVE.kid,
    );
    const config = {
      IDENTITY_INTERNAL_JWT_ISSUER: TEST_INTERNAL_JWT_ISSUER,
      IDENTITY_INTERNAL_JWT_TTL_SECONDS: 300,
    } as IdentityEnv;

    const issued = await signInternalJwt(keyring, config, 'user-42', TEST_GATEWAY_AUDIENCE);
    const payload = decodeJwt(issued.accessToken);

    expect(payload.sub).toBe('user-42');
    expect(payload.aud).toBe(TEST_GATEWAY_AUDIENCE);
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('roles');
    expect(payload).not.toHaveProperty('permissions');
    expect(payload).not.toHaveProperty('discord');
    expect(payload).not.toHaveProperty('sessionId');
    expect(payload).not.toHaveProperty('session_id');
  });
});

describe('service-auth and internal JWT rotation', () => {
  let fixtures: Awaited<ReturnType<typeof getIdentityTestFixtures>>;

  beforeAll(async () => {
    fixtures = await getIdentityTestFixtures();
  });

  it('keeps retiring public key in JWKS while retired stays out', async () => {
    const keyring = await loadInternalJwtKeyring(
      await buildTestInternalJwtKeyringJson({ includeRetired: true }),
      fixtures.TEST_INTERNAL_ACTIVE.kid,
    );
    const kids = keyring.jwks.keys.map((key) => key.kid);
    expect(kids).toContain(fixtures.TEST_INTERNAL_RETIRING.kid);
    expect(kids).not.toContain(fixtures.TEST_INTERNAL_RETIRED.kid);
  });
});
