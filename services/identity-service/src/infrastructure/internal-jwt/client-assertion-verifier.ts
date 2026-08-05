import {
  createLocalJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
} from 'jose';
import { z } from 'zod';

import { IdentityError } from '../../domain/errors.js';
import type { IdentityEnv } from '../config/identity-env.js';
import {
  getServiceClient,
  getVerifiableServiceKey,
  type ServiceClientRegistry,
} from './service-client-registry.js';

const ALLOWED_ALGORITHM = 'EdDSA';
const uuidSchema = z.string().uuid();

export interface VerifiedClientAssertion {
  readonly clientId: string;
  readonly kid: string;
  readonly jti: string;
}

function reject(message?: string): never {
  throw new IdentityError('CLIENT_ASSERTION_INVALID', message);
}

function requireStringClaim(payload: JWTPayload, claim: 'iss' | 'sub' | 'jti'): string {
  const value = payload[claim];
  if (typeof value !== 'string' || value.length === 0) {
    reject(`Missing ${claim}`);
  }
  return value;
}

function requireExactIssueAudience(payload: JWTPayload, issueUrl: string): void {
  const aud = payload.aud;
  if (Array.isArray(aud)) {
    reject('Assertion aud must be a single string, not an array');
  }
  if (typeof aud !== 'string' || aud !== issueUrl) {
    reject('Assertion aud must exactly equal IDENTITY_INTERNAL_JWT_ISSUE_URL');
  }
}

function requireIntegerClaim(payload: JWTPayload, claim: 'iat' | 'exp'): number {
  const value = payload[claim];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    reject(`Assertion ${claim} must be an integer`);
  }
  return value;
}

export async function verifyClientAssertion(
  assertion: string,
  config: Pick<
    IdentityEnv,
    | 'IDENTITY_INTERNAL_JWT_ISSUE_URL'
    | 'IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS'
    | 'IDENTITY_CLIENT_ASSERTION_CLOCK_SKEW_SECONDS'
  >,
  registry: ServiceClientRegistry,
): Promise<VerifiedClientAssertion> {
  let protectedHeader: { alg?: string; kid?: string };
  try {
    protectedHeader = decodeProtectedHeader(assertion);
  } catch {
    reject('Invalid assertion header');
  }

  if (protectedHeader.alg !== ALLOWED_ALGORITHM) {
    reject('Algorithm must be EdDSA');
  }

  const kid = protectedHeader.kid;
  if (typeof kid !== 'string' || kid.length === 0) {
    reject('kid is required in assertion header');
  }

  const keyEntry = getVerifiableServiceKey(registry, kid);
  if (keyEntry === undefined) {
    reject('Unknown or retired service-auth kid');
  }

  const issueUrl = config.IDENTITY_INTERNAL_JWT_ISSUE_URL;
  if (issueUrl === undefined) {
    reject('Identity issue URL is not configured');
  }

  let decoded: JWTPayload;
  try {
    decoded = decodeJwt(assertion);
  } catch {
    reject('Invalid assertion payload');
  }

  if ('kid' in decoded) {
    reject('kid must not appear in assertion payload');
  }

  const iss = requireStringClaim(decoded, 'iss');
  const sub = requireStringClaim(decoded, 'sub');
  const jti = requireStringClaim(decoded, 'jti');

  if (iss !== sub) {
    reject('Assertion iss must equal sub');
  }

  if (keyEntry.clientId !== iss) {
    reject('Assertion kid does not belong to claimed iss/client_id');
  }

  if (!uuidSchema.safeParse(jti).success) {
    reject('Assertion jti must be a UUID');
  }

  requireExactIssueAudience(decoded, issueUrl);

  const iat = requireIntegerClaim(decoded, 'iat');
  const exp = requireIntegerClaim(decoded, 'exp');
  const nowSeconds = Math.floor(Date.now() / 1000);
  const clockSkew = config.IDENTITY_CLIENT_ASSERTION_CLOCK_SKEW_SECONDS;

  if (iat > nowSeconds + clockSkew) {
    reject('Assertion iat is too far in the future');
  }

  if (exp <= iat) {
    reject('Assertion exp must be greater than iat');
  }

  const ttl = exp - iat;
  if (ttl > config.IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS) {
    reject('Assertion TTL exceeds allowed maximum');
  }

  const client = getServiceClient(registry, keyEntry.clientId);
  if (client === undefined) {
    reject('Unknown client_id');
  }

  const jwks = createLocalJWKSet({ keys: [keyEntry.key.publicJwk] });
  let payload: JWTPayload;

  try {
    const verified = await jwtVerify(assertion, jwks, {
      algorithms: [ALLOWED_ALGORITHM],
      issuer: keyEntry.clientId,
      audience: issueUrl,
      clockTolerance: clockSkew,
    });
    payload = verified.payload;
  } catch {
    reject('Invalid client assertion signature or claims');
  }

  if ('kid' in payload) {
    reject('kid must not appear in assertion payload');
  }

  if (payload.iss !== keyEntry.clientId || payload.sub !== keyEntry.clientId) {
    reject('Assertion iss/sub must equal key owner client_id');
  }

  requireExactIssueAudience(payload, issueUrl);
  const verifiedJti = requireStringClaim(payload, 'jti');
  if (!uuidSchema.safeParse(verifiedJti).success) {
    reject('Assertion jti must be a UUID');
  }

  return { clientId: keyEntry.clientId, kid, jti: verifiedJti };
}

export function assertAudienceAllowedForClient(
  registry: ServiceClientRegistry,
  clientId: string,
  audience: string,
): void {
  const client = getServiceClient(registry, clientId);
  if (client === undefined || !client.allowedAudiences.includes(audience)) {
    throw new IdentityError(
      'AUDIENCE_NOT_ALLOWED',
      'Client is not allowed to request this audience',
    );
  }
}
