import { Redis } from 'ioredis';
import {
  createLocalJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  exportJWK,
  importSPKI,
  jwtVerify,
  type JWK,
  type JWTPayload,
} from 'jose';
import { z } from 'zod';

import { AuthorizationError } from '../../domain/errors.js';
import { AuthorizationConfigError } from '../config/authorization-env.js';

const ALLOWED_ALGORITHM = 'EdDSA';
const uuidSchema = z.string().uuid();
const keyStatusSchema = z.enum(['active', 'retiring', 'retired']);

type Ed25519PublicKey = Awaited<ReturnType<typeof importSPKI>>;

const inboundClientKeySchema = z.object({
  kid: z.string().min(1),
  status: keyStatusSchema,
  public_key_pem: z.string().min(1),
});

const inboundClientSchema = z.object({
  client_id: z.string().min(1),
  keys: z.array(inboundClientKeySchema).min(1),
  // S2S allowlist: the exact set of Authorization operations this client is
  // permitted to invoke. Omitted/empty means the client may call no guarded
  // route (deny-by-default), so a compromised or misconfigured client cannot
  // reach operations outside its role.
  allowed_operations: z.array(z.string().min(1)).default([]),
});

export interface InboundClientPublicKey {
  readonly kid: string;
  readonly status: z.infer<typeof keyStatusSchema>;
  readonly publicKey: Ed25519PublicKey;
  readonly publicJwk: JWK;
}

export interface InboundClientRecord {
  readonly clientId: string;
  readonly keys: ReadonlyMap<string, InboundClientPublicKey>;
  readonly allowedOperations: ReadonlySet<string>;
}

export interface InboundClientRegistry {
  readonly clients: ReadonlyMap<string, InboundClientRecord>;
  readonly keysByKid: ReadonlyMap<string, { clientId: string; key: InboundClientPublicKey }>;
}

export interface VerifiedInboundAssertion {
  readonly clientId: string;
  readonly kid: string;
  readonly jti: string;
  /** Optional operator identity the client is acting on behalf of. */
  readonly actorV2UserId?: string;
  readonly actorDiscordUserId?: string;
}

export interface VerifyInboundAssertionOptions {
  readonly expectedAudience: string;
  readonly maxTtlSeconds: number;
  readonly clockSkewSeconds?: number;
}

async function importPublicKey(
  publicPem: string,
  kid: string,
  status: z.infer<typeof keyStatusSchema>,
): Promise<InboundClientPublicKey> {
  const publicKey = await importSPKI(publicPem, 'EdDSA');
  const publicJwk = await exportJWK(publicKey);
  return {
    kid,
    status,
    publicKey,
    publicJwk: { ...publicJwk, kid, alg: 'EdDSA', use: 'sig' },
  };
}

/**
 * Parse AUTHORIZATION_INBOUND_CLIENTS_JSON into a verifiable public-key registry.
 * Private keys are never accepted here — callers supply SPKI public PEMs only.
 */
export async function loadInboundClientRegistry(
  clientsJson: string,
): Promise<InboundClientRegistry> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(clientsJson);
  } catch {
    throw new AuthorizationConfigError('AUTHORIZATION_INBOUND_CLIENTS_JSON must be valid JSON');
  }

  const records = z.array(inboundClientSchema).min(1).parse(parsed);
  const clients = new Map<string, InboundClientRecord>();
  const keysByKid = new Map<string, { clientId: string; key: InboundClientPublicKey }>();
  const globalKids = new Set<string>();

  for (const record of records) {
    if (clients.has(record.client_id)) {
      throw new AuthorizationConfigError(`Duplicate inbound client_id: ${record.client_id}`);
    }

    const keys = new Map<string, InboundClientPublicKey>();
    let activeCount = 0;

    for (const keyRecord of record.keys) {
      if (globalKids.has(keyRecord.kid)) {
        throw new AuthorizationConfigError(`Duplicate inbound assertion kid: ${keyRecord.kid}`);
      }
      globalKids.add(keyRecord.kid);

      const key = await importPublicKey(keyRecord.public_key_pem, keyRecord.kid, keyRecord.status);
      keys.set(keyRecord.kid, key);
      keysByKid.set(keyRecord.kid, { clientId: record.client_id, key });

      if (keyRecord.status === 'active') {
        activeCount += 1;
      }
    }

    if (activeCount < 1) {
      throw new AuthorizationConfigError(
        `Inbound client ${record.client_id} must have at least one active public key`,
      );
    }

    clients.set(record.client_id, {
      clientId: record.client_id,
      keys,
      allowedOperations: new Set(record.allowed_operations),
    });
  }

  return { clients, keysByKid };
}

function getVerifiableInboundKey(
  registry: InboundClientRegistry,
  kid: string,
): { clientId: string; key: InboundClientPublicKey } | undefined {
  const entry = registry.keysByKid.get(kid);
  if (entry === undefined) {
    return undefined;
  }
  if (entry.key.status === 'retired') {
    return undefined;
  }
  return entry;
}

function reject(message?: string): never {
  throw new AuthorizationError('CLIENT_ASSERTION_INVALID', message);
}

function requireStringClaim(payload: JWTPayload, claim: 'iss' | 'sub' | 'jti'): string {
  const value = payload[claim];
  if (typeof value !== 'string' || value.length === 0) {
    reject(`Missing ${claim}`);
  }
  return value;
}

function requireExactAudience(payload: JWTPayload, expectedAudience: string): void {
  const aud = payload.aud;
  if (Array.isArray(aud)) {
    reject('Assertion aud must be a single string, not an array');
  }
  if (typeof aud !== 'string' || aud !== expectedAudience) {
    reject('Assertion aud must exactly equal expected audience');
  }
}

function optionalStringClaim(payload: JWTPayload, claim: string): string | undefined {
  const value = payload[claim];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    reject(`Assertion ${claim} must be a non-empty string when present`);
  }
  return value;
}

function requireIntegerClaim(payload: JWTPayload, claim: 'iat' | 'exp'): number {
  const value = payload[claim];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    reject(`Assertion ${claim} must be an integer`);
  }
  return value;
}

/**
 * Verify an inbound EdDSA client assertion destined for Authorization.
 * Mirrors Identity's client-assertion rules with a caller-supplied expected audience.
 */
export async function verifyInboundAssertion(
  assertion: string,
  options: VerifyInboundAssertionOptions,
  registry: InboundClientRegistry,
): Promise<VerifiedInboundAssertion> {
  const clockSkew = options.clockSkewSeconds ?? 60;
  const expectedAudience = options.expectedAudience;

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

  const keyEntry = getVerifiableInboundKey(registry, kid);
  if (keyEntry === undefined) {
    reject('Unknown or retired inbound assertion kid');
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

  requireExactAudience(decoded, expectedAudience);

  const iat = requireIntegerClaim(decoded, 'iat');
  const exp = requireIntegerClaim(decoded, 'exp');
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (iat > nowSeconds + clockSkew) {
    reject('Assertion iat is too far in the future');
  }

  if (exp <= iat) {
    reject('Assertion exp must be greater than iat');
  }

  const ttl = exp - iat;
  if (ttl > options.maxTtlSeconds) {
    reject('Assertion TTL exceeds allowed maximum');
  }

  if (!registry.clients.has(keyEntry.clientId)) {
    reject('Unknown client_id');
  }

  const jwks = createLocalJWKSet({ keys: [keyEntry.key.publicJwk] });
  let payload: JWTPayload;

  try {
    const verified = await jwtVerify(assertion, jwks, {
      algorithms: [ALLOWED_ALGORITHM],
      issuer: keyEntry.clientId,
      audience: expectedAudience,
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

  requireExactAudience(payload, expectedAudience);
  const verifiedJti = requireStringClaim(payload, 'jti');
  if (!uuidSchema.safeParse(verifiedJti).success) {
    reject('Assertion jti must be a UUID');
  }

  const actorV2UserId = optionalStringClaim(payload, 'actor_v2_user_id');
  const actorDiscordUserId = optionalStringClaim(payload, 'actor_discord_user_id');

  return {
    clientId: keyEntry.clientId,
    kid,
    jti: verifiedJti,
    ...(actorV2UserId !== undefined ? { actorV2UserId } : {}),
    ...(actorDiscordUserId !== undefined ? { actorDiscordUserId } : {}),
  };
}

export interface AssertionJtiStore {
  assertOnce(jti: string, ttlSeconds: number): Promise<void>;
  close(): Promise<void>;
}

export class RedisAssertionJtiStore implements AssertionJtiStore {
  public constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
  ) {}

  public async assertOnce(jti: string, ttlSeconds: number): Promise<void> {
    const key = `${this.prefix}${jti}`;
    try {
      const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
      if (result !== 'OK') {
        throw new AuthorizationError(
          'CLIENT_ASSERTION_REPLAY',
          'Client assertion jti was already used',
        );
      }
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      throw new AuthorizationError(
        'CLIENT_ASSERTION_REPLAY',
        'Client assertion replay store is unavailable',
      );
    }
  }

  public async close(): Promise<void> {
    await this.redis.quit();
  }
}

export function createAssertionJtiStore(redisUrl: string, prefix: string): RedisAssertionJtiStore {
  return new RedisAssertionJtiStore(new Redis(redisUrl, { lazyConnect: false }), prefix);
}
