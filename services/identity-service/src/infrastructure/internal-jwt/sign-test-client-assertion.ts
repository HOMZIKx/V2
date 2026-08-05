import { importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

import type { IdentityEnv } from '../config/identity-env.js';
import {
  getIdentityTestFixtures,
  TEST_GATEWAY_CLIENT_ID,
  TEST_INTERNAL_JWT_ISSUE_URL,
} from './test-fixtures.js';

export async function signTestClientAssertion(options: {
  readonly config: Pick<
    IdentityEnv,
    'IDENTITY_INTERNAL_JWT_ISSUE_URL' | 'IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS'
  >;
  readonly clientId?: string;
  readonly kid?: string;
  readonly privatePem?: string;
  readonly jti?: string;
  readonly audience?: string | string[];
  readonly expiresInSeconds?: number;
  readonly issuedAtSeconds?: number;
  readonly iss?: string;
  readonly sub?: string;
  readonly alg?: string;
  readonly includeKidInPayload?: boolean;
  readonly omitClaim?: 'jti' | 'iat' | 'exp' | 'iss' | 'sub' | 'aud';
}): Promise<string> {
  const fixtures = await getIdentityTestFixtures();
  const privatePem = options.privatePem ?? fixtures.TEST_SERVICE_GATEWAY_ACTIVE.privatePem;
  const key = await importPKCS8(privatePem, 'EdDSA');
  const clientId = options.clientId ?? TEST_GATEWAY_CLIENT_ID;
  const now = Math.floor(Date.now() / 1000);
  const iat = options.issuedAtSeconds ?? now;
  const exp =
    options.expiresInSeconds !== undefined
      ? iat + options.expiresInSeconds
      : iat + (options.config.IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS ?? 60);
  const audience =
    options.audience ??
    options.config.IDENTITY_INTERNAL_JWT_ISSUE_URL ??
    TEST_INTERNAL_JWT_ISSUE_URL;

  const payload: Record<string, unknown> = {};
  if (options.omitClaim !== 'jti') {
    payload.jti = options.jti ?? randomUUID();
  }
  if (options.includeKidInPayload === true) {
    payload.kid = options.kid ?? fixtures.TEST_SERVICE_GATEWAY_ACTIVE.kid;
  }

  let builder = new SignJWT(payload).setProtectedHeader({
    alg: options.alg ?? 'EdDSA',
    kid: options.kid ?? fixtures.TEST_SERVICE_GATEWAY_ACTIVE.kid,
  });

  if (options.omitClaim !== 'iss') {
    builder = builder.setIssuer(options.iss ?? clientId);
  }
  if (options.omitClaim !== 'sub') {
    builder = builder.setSubject(options.sub ?? clientId);
  }
  if (options.omitClaim !== 'aud') {
    builder = builder.setAudience(audience);
  }
  if (options.omitClaim !== 'iat') {
    builder = builder.setIssuedAt(iat);
  }
  if (options.omitClaim !== 'exp') {
    builder = builder.setExpirationTime(exp);
  }

  return builder.sign(key);
}
