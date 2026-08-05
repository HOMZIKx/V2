import {
  createLocalJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
  type JWK,
  type JWTPayload,
} from 'jose';

import { InternalJwtVerificationError } from './errors.js';

const ALLOWED_ALGORITHM = 'EdDSA';
const MAX_TTL_SECONDS = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export interface VerifiedInternalJwt {
  readonly sub: string;
  readonly jti: string;
  readonly exp: number;
  readonly kid: string;
}

export interface VerifyInternalJwtOptions {
  readonly token: string;
  readonly expectedIssuer: string;
  readonly expectedAudience: string;
  readonly jwks: { readonly keys: readonly JWK[] };
  readonly clockToleranceSeconds?: number;
}

function reject(code: string, message: string): never {
  throw new InternalJwtVerificationError(code, message);
}

function requireStringClaim(payload: JWTPayload, claim: 'sub' | 'jti'): string {
  const value = payload[claim];
  if (typeof value !== 'string' || value.length === 0) {
    reject(`MISSING_${claim.toUpperCase()}`, `Missing ${claim}`);
  }
  return value;
}

function requireExactAudience(payload: JWTPayload, expectedAudience: string): void {
  const aud = payload.aud;
  if (Array.isArray(aud)) {
    reject('INVALID_AUD', 'aud must be a single string, not an array');
  }
  if (typeof aud !== 'string' || aud !== expectedAudience) {
    reject('INVALID_AUD', 'aud must exactly equal expectedAudience');
  }
}

function requireIntegerClaim(payload: JWTPayload, claim: 'iat' | 'exp'): number {
  const value = payload[claim];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    reject(`INVALID_${claim.toUpperCase()}`, `${claim} must be an integer`);
  }
  return value;
}

function validateTimeClaims(iat: number, exp: number): void {
  if (exp <= iat) {
    reject('INVALID_EXP', 'exp must be greater than iat');
  }
  const ttl = exp - iat;
  if (ttl > MAX_TTL_SECONDS) {
    reject('TTL_EXCEEDED', `Token TTL must be <= ${MAX_TTL_SECONDS} seconds`);
  }
}

/**
 * Verify an internal service JWT against Identity JWKS. Returns header kid as
 * metadata; kid must never be present in the payload.
 */
export async function verifyInternalJwt(
  options: VerifyInternalJwtOptions,
): Promise<VerifiedInternalJwt> {
  let protectedHeader: { alg?: string; kid?: string };
  try {
    protectedHeader = decodeProtectedHeader(options.token);
  } catch {
    reject('INVALID_HEADER', 'Invalid JWT header');
  }

  if (protectedHeader.alg !== ALLOWED_ALGORITHM) {
    reject('INVALID_ALG', 'Algorithm must be EdDSA');
  }

  const kid = protectedHeader.kid;
  if (typeof kid !== 'string' || kid.length === 0) {
    reject('MISSING_KID', 'kid is required in JWT header');
  }

  let decoded: JWTPayload;
  try {
    decoded = decodeJwt(options.token);
  } catch {
    reject('INVALID_TOKEN', 'Invalid JWT payload');
  }

  if ('kid' in decoded) {
    reject('KID_IN_PAYLOAD', 'kid must not appear in JWT payload');
  }

  requireExactAudience(decoded, options.expectedAudience);
  const iat = requireIntegerClaim(decoded, 'iat');
  const exp = requireIntegerClaim(decoded, 'exp');
  validateTimeClaims(iat, exp);
  const jtiCandidate = requireStringClaim(decoded, 'jti');
  if (!isUuid(jtiCandidate)) {
    reject('INVALID_JTI', 'jti must be a UUID');
  }

  const jwks = createLocalJWKSet({ keys: [...options.jwks.keys] });
  let payload: JWTPayload;

  try {
    const result = await jwtVerify(options.token, jwks, {
      issuer: options.expectedIssuer,
      audience: options.expectedAudience,
      algorithms: [ALLOWED_ALGORITHM],
      clockTolerance: options.clockToleranceSeconds ?? 60,
    });
    payload = result.payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'verification failed';
    reject('VERIFICATION_FAILED', message);
  }

  if ('kid' in payload) {
    reject('KID_IN_PAYLOAD', 'kid must not appear in JWT payload');
  }

  requireExactAudience(payload, options.expectedAudience);
  const verifiedIat = requireIntegerClaim(payload, 'iat');
  const verifiedExp = requireIntegerClaim(payload, 'exp');
  validateTimeClaims(verifiedIat, verifiedExp);

  const sub = requireStringClaim(payload, 'sub');
  const jti = requireStringClaim(payload, 'jti');
  if (!isUuid(jti)) {
    reject('INVALID_JTI', 'jti must be a UUID');
  }

  return { sub, jti, exp: verifiedExp, kid };
}
