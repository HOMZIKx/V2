import { importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { InternalJwtVerificationError } from './errors.js';
import {
  getSharedTestFixtures,
  TEST_AUDIENCE,
  TEST_ISSUER,
  type SharedInternalJwtTestFixtures,
} from './test-fixtures.js';
import { verifyInternalJwt } from './verify-internal-jwt.js';

async function signInternalToken(
  fixtures: SharedInternalJwtTestFixtures,
  options: {
    readonly kid?: string;
    readonly privatePem?: string;
    readonly sub?: string;
    readonly jti?: string;
    readonly issuer?: string;
    readonly audience?: string | string[];
    readonly expiresInSeconds?: number;
    readonly issuedAtSeconds?: number;
    readonly extraPayload?: Record<string, unknown>;
    readonly omitKidHeader?: boolean;
    readonly alg?: string;
    readonly omitIat?: boolean;
  },
): Promise<string> {
  const key = await importPKCS8(
    options.privatePem ?? fixtures.TEST_INTERNAL_ACTIVE.privatePem,
    'EdDSA',
  );
  const now = Math.floor(Date.now() / 1000);
  const iat = options.issuedAtSeconds ?? now;
  const exp = iat + (options.expiresInSeconds ?? 300);
  const header: { alg: string; kid?: string } = {
    alg: options.alg ?? 'EdDSA',
  };
  if (options.omitKidHeader !== true) {
    header.kid = options.kid ?? fixtures.TEST_INTERNAL_ACTIVE.kid;
  }

  let builder = new SignJWT({
    jti: options.jti ?? randomUUID(),
    ...(options.extraPayload ?? {}),
  })
    .setProtectedHeader(header)
    .setSubject(options.sub ?? 'user-123')
    .setIssuer(options.issuer ?? TEST_ISSUER)
    .setAudience(options.audience ?? TEST_AUDIENCE)
    .setExpirationTime(exp);

  if (options.omitIat !== true) {
    builder = builder.setIssuedAt(iat);
  }

  return builder.sign(key);
}

describe('verifyInternalJwt', () => {
  let fixtures: SharedInternalJwtTestFixtures;
  let jwks: { keys: SharedInternalJwtTestFixtures['TEST_INTERNAL_ACTIVE']['publicJwk'][] };

  beforeAll(async () => {
    fixtures = await getSharedTestFixtures();
    jwks = {
      keys: [fixtures.TEST_INTERNAL_ACTIVE.publicJwk, fixtures.TEST_INTERNAL_RETIRING.publicJwk],
    };
  });

  it('verifies a valid internal JWT and returns header kid metadata', async () => {
    const jti = randomUUID();
    const token = await signInternalToken(fixtures, { jti });

    const verified = await verifyInternalJwt({
      token,
      expectedIssuer: TEST_ISSUER,
      expectedAudience: TEST_AUDIENCE,
      jwks,
    });

    expect(verified.sub).toBe('user-123');
    expect(verified.jti).toBe(jti);
    expect(verified.kid).toBe(fixtures.TEST_INTERNAL_ACTIVE.kid);
    expect(typeof verified.exp).toBe('number');
  });

  it('rejects wrong issuer', async () => {
    const token = await signInternalToken(fixtures, { issuer: 'https://evil.example' });
    await expect(
      verifyInternalJwt({
        token,
        expectedIssuer: TEST_ISSUER,
        expectedAudience: TEST_AUDIENCE,
        jwks,
      }),
    ).rejects.toBeInstanceOf(InternalJwtVerificationError);
  });

  it('rejects wrong audience', async () => {
    const token = await signInternalToken(fixtures, { audience: 'v2.other-service' });
    await expect(
      verifyInternalJwt({
        token,
        expectedIssuer: TEST_ISSUER,
        expectedAudience: TEST_AUDIENCE,
        jwks,
      }),
    ).rejects.toBeInstanceOf(InternalJwtVerificationError);
  });

  it('rejects audience as array even when it contains the expected value', async () => {
    const token = await signInternalToken(fixtures, {
      audience: [TEST_AUDIENCE, 'v2.other-service'],
    });
    await expect(
      verifyInternalJwt({
        token,
        expectedIssuer: TEST_ISSUER,
        expectedAudience: TEST_AUDIENCE,
        jwks,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_AUD' });
  });

  it('rejects invalid signature', async () => {
    const token = await signInternalToken(fixtures, {
      kid: fixtures.TEST_INTERNAL_RETIRING.kid,
      privatePem: fixtures.TEST_INTERNAL_RETIRING.privatePem,
    });
    await expect(
      verifyInternalJwt({
        token,
        expectedIssuer: TEST_ISSUER,
        expectedAudience: TEST_AUDIENCE,
        jwks: { keys: [fixtures.TEST_INTERNAL_ACTIVE.publicJwk] },
      }),
    ).rejects.toBeInstanceOf(InternalJwtVerificationError);
  });

  it('rejects unknown kid when signature key is not in JWKS', async () => {
    const token = await signInternalToken(fixtures, { kid: 'unknown-kid' });
    await expect(
      verifyInternalJwt({
        token,
        expectedIssuer: TEST_ISSUER,
        expectedAudience: TEST_AUDIENCE,
        jwks,
      }),
    ).rejects.toBeInstanceOf(InternalJwtVerificationError);
  });

  it('rejects expired token', async () => {
    const token = await signInternalToken(fixtures, { expiresInSeconds: -120 });
    await expect(
      verifyInternalJwt({
        token,
        expectedIssuer: TEST_ISSUER,
        expectedAudience: TEST_AUDIENCE,
        jwks,
      }),
    ).rejects.toBeInstanceOf(InternalJwtVerificationError);
  });

  it('rejects missing header kid', async () => {
    const token = await signInternalToken(fixtures, { omitKidHeader: true });
    await expect(
      verifyInternalJwt({
        token,
        expectedIssuer: TEST_ISSUER,
        expectedAudience: TEST_AUDIENCE,
        jwks,
      }),
    ).rejects.toBeInstanceOf(InternalJwtVerificationError);
  });

  it('rejects kid in payload', async () => {
    const token = await signInternalToken(fixtures, {
      extraPayload: { kid: fixtures.TEST_INTERNAL_ACTIVE.kid },
    });
    await expect(
      verifyInternalJwt({
        token,
        expectedIssuer: TEST_ISSUER,
        expectedAudience: TEST_AUDIENCE,
        jwks,
      }),
    ).rejects.toMatchObject({ code: 'KID_IN_PAYLOAD' });
  });

  it('rejects non-UUID jti', async () => {
    const token = await signInternalToken(fixtures, { jti: 'not-a-uuid' });
    await expect(
      verifyInternalJwt({
        token,
        expectedIssuer: TEST_ISSUER,
        expectedAudience: TEST_AUDIENCE,
        jwks,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_JTI' });
  });

  it('rejects missing iat', async () => {
    const token = await signInternalToken(fixtures, { omitIat: true });
    await expect(
      verifyInternalJwt({
        token,
        expectedIssuer: TEST_ISSUER,
        expectedAudience: TEST_AUDIENCE,
        jwks,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_IAT' });
  });

  it('rejects TTL above 300 seconds', async () => {
    const token = await signInternalToken(fixtures, { expiresInSeconds: 301 });
    await expect(
      verifyInternalJwt({
        token,
        expectedIssuer: TEST_ISSUER,
        expectedAudience: TEST_AUDIENCE,
        jwks,
      }),
    ).rejects.toMatchObject({ code: 'TTL_EXCEEDED' });
  });

  it('rejects wrong algorithm', async () => {
    const token = await new SignJWT({ jti: randomUUID() })
      .setProtectedHeader({ alg: 'HS256', kid: fixtures.TEST_INTERNAL_ACTIVE.kid })
      .setSubject('user-123')
      .setIssuer(TEST_ISSUER)
      .setAudience(TEST_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('300s')
      .sign(new TextEncoder().encode('not-a-real-secret-but-long-enough'));

    await expect(
      verifyInternalJwt({
        token,
        expectedIssuer: TEST_ISSUER,
        expectedAudience: TEST_AUDIENCE,
        jwks,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ALG' });
  });

  it('rejects exp <= iat', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signInternalToken(fixtures, {
      issuedAtSeconds: now,
      expiresInSeconds: 0,
    });
    await expect(
      verifyInternalJwt({
        token,
        expectedIssuer: TEST_ISSUER,
        expectedAudience: TEST_AUDIENCE,
        jwks,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EXP' });
  });
});
