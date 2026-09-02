import {
  createLocalJWKSet,
  decodeProtectedHeader,
  exportJWK,
  importSPKI,
  jwtVerify,
  type JWK,
} from 'jose';
import { z } from 'zod';

import { ActivityError } from '../../domain/errors.js';
import { ActivityConfigError } from '../config/activity-env.js';

const ALLOWED_ALGORITHM = 'EdDSA';

type Ed25519PublicKey = Awaited<ReturnType<typeof importSPKI>>;

const inboundClientKeySchema = z.object({
  kid: z.string().min(1),
  status: z.enum(['active', 'retiring', 'retired']),
  public_key_pem: z.string().min(1),
});

const inboundClientSchema = z.object({
  client_id: z.string().min(1),
  keys: z.array(inboundClientKeySchema).min(1),
  allowed_operations: z.array(z.string().min(1)).default([]),
});

export interface InboundClientPublicKey {
  readonly kid: string;
  readonly status: 'active' | 'retiring' | 'retired';
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
  readonly actorV2UserId?: string;
  readonly actorDiscordUserId?: string;
}

export async function loadInboundClientRegistry(
  clientsJson: string,
): Promise<InboundClientRegistry> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(clientsJson);
  } catch {
    throw new ActivityConfigError('ACTIVITY_INBOUND_CLIENTS_JSON must be valid JSON');
  }

  const arraySchema = z.array(inboundClientSchema);
  const clientsParsed = arraySchema.safeParse(parsed);
  if (!clientsParsed.success) {
    throw new ActivityConfigError('ACTIVITY_INBOUND_CLIENTS_JSON has invalid shape');
  }

  const clients = new Map<string, InboundClientRecord>();
  const keysByKid = new Map<string, { clientId: string; key: InboundClientPublicKey }>();

  for (const entry of clientsParsed.data) {
    const keys = new Map<string, InboundClientPublicKey>();
    for (const key of entry.keys) {
      const publicKey = await importSPKI(key.public_key_pem, 'EdDSA');
      const publicJwk = await exportJWK(publicKey);
      const record: InboundClientPublicKey = {
        kid: key.kid,
        status: key.status,
        publicKey,
        publicJwk: { ...publicJwk, kid: key.kid, alg: 'EdDSA', use: 'sig' },
      };
      keys.set(key.kid, record);
      keysByKid.set(key.kid, { clientId: entry.client_id, key: record });
    }
    clients.set(entry.client_id, {
      clientId: entry.client_id,
      keys,
      allowedOperations: new Set(entry.allowed_operations),
    });
  }

  return { clients, keysByKid };
}

export async function verifyInboundAssertion(
  assertion: string,
  options: { expectedAudience: string; maxTtlSeconds: number },
  registry: InboundClientRegistry,
): Promise<VerifiedInboundAssertion> {
  let header: { kid?: string; alg?: string };
  try {
    header = decodeProtectedHeader(assertion);
  } catch {
    throw new ActivityError('CLIENT_ASSERTION_INVALID', 'Malformed assertion header');
  }

  if (header.alg !== ALLOWED_ALGORITHM || header.kid === undefined) {
    throw new ActivityError('CLIENT_ASSERTION_INVALID', 'Invalid assertion algorithm or kid');
  }

  const keyEntry = registry.keysByKid.get(header.kid);
  if (keyEntry === undefined || keyEntry.key.status === 'retired') {
    throw new ActivityError('CLIENT_ASSERTION_INVALID', 'Unknown or retired kid');
  }

  const jwks = createLocalJWKSet({
    keys: [keyEntry.key.publicJwk],
  });

  let payload;
  try {
    const verified = await jwtVerify(assertion, jwks, {
      algorithms: [ALLOWED_ALGORITHM],
      issuer: keyEntry.clientId,
      audience: options.expectedAudience,
      maxTokenAge: `${options.maxTtlSeconds}s`,
      clockTolerance: 60,
    });
    payload = verified.payload;
  } catch {
    throw new ActivityError('CLIENT_ASSERTION_INVALID', 'Assertion verification failed');
  }

  if ('kid' in payload) {
    throw new ActivityError('CLIENT_ASSERTION_INVALID', 'kid must not appear in assertion payload');
  }

  if (Array.isArray(payload.aud)) {
    throw new ActivityError('CLIENT_ASSERTION_INVALID', 'Assertion aud must be a single string');
  }

  const clientId = typeof payload.iss === 'string' ? payload.iss : undefined;
  const subject = typeof payload.sub === 'string' ? payload.sub : undefined;
  const jti = typeof payload.jti === 'string' ? payload.jti : undefined;
  if (clientId === undefined || jti === undefined || clientId !== keyEntry.clientId) {
    throw new ActivityError('CLIENT_ASSERTION_INVALID', 'Assertion iss/jti invalid');
  }
  if (subject !== clientId) {
    throw new ActivityError('CLIENT_ASSERTION_INVALID', 'Assertion sub must equal iss');
  }
  if (!z.string().uuid().safeParse(jti).success) {
    throw new ActivityError('CLIENT_ASSERTION_INVALID', 'Assertion jti must be a UUID');
  }

  const actorDiscord = optionalActorClaim(payload.actor_discord_user_id, 'actor_discord_user_id');
  const actorV2 = optionalActorClaim(payload.actor_v2_user_id, 'actor_v2_user_id');

  return {
    clientId,
    kid: header.kid,
    jti,
    ...(actorDiscord !== undefined ? { actorDiscordUserId: actorDiscord } : {}),
    ...(actorV2 !== undefined ? { actorV2UserId: actorV2 } : {}),
  };
}

function optionalActorClaim(value: unknown, claim: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new ActivityError(
      'CLIENT_ASSERTION_INVALID',
      `Assertion ${claim} must be a non-empty string when present`,
    );
  }
  return value;
}
