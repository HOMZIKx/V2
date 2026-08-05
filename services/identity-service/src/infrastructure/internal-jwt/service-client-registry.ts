import { exportJWK, importSPKI, type JWK } from 'jose';
import { z } from 'zod';

import { IdentityConfigError } from '../config/identity-env.js';

const keyStatusSchema = z.enum(['active', 'retiring', 'retired']);

type Ed25519PublicKey = Awaited<ReturnType<typeof importSPKI>>;

const serviceClientKeySchema = z.object({
  kid: z.string().min(1),
  status: keyStatusSchema,
  public_key_pem: z.string().min(1),
});

const serviceClientSchema = z.object({
  client_id: z.string().min(1),
  allowed_audiences: z.array(z.string().min(1)).min(1),
  keys: z.array(serviceClientKeySchema).min(1),
});

export interface ServiceClientPublicKey {
  readonly kid: string;
  readonly status: z.infer<typeof keyStatusSchema>;
  readonly publicKey: Ed25519PublicKey;
  readonly publicJwk: JWK;
}

export interface ServiceClientRecord {
  readonly clientId: string;
  readonly allowedAudiences: readonly string[];
  readonly keys: ReadonlyMap<string, ServiceClientPublicKey>;
}

export interface ServiceClientRegistry {
  readonly clients: ReadonlyMap<string, ServiceClientRecord>;
  readonly keysByKid: ReadonlyMap<string, { clientId: string; key: ServiceClientPublicKey }>;
}

async function importPublicKey(publicPem: string, kid: string): Promise<ServiceClientPublicKey> {
  const publicKey = await importSPKI(publicPem, 'EdDSA');
  const publicJwk = await exportJWK(publicKey);
  return {
    kid,
    status: 'active',
    publicKey,
    publicJwk: { ...publicJwk, kid, alg: 'EdDSA', use: 'sig' },
  };
}

export async function loadServiceClientRegistry(
  clientsJson: string,
): Promise<ServiceClientRegistry> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(clientsJson);
  } catch {
    throw new IdentityConfigError('IDENTITY_SERVICE_CLIENTS_JSON must be valid JSON');
  }

  const records = z.array(serviceClientSchema).min(1).parse(parsed);
  const clients = new Map<string, ServiceClientRecord>();
  const keysByKid = new Map<string, { clientId: string; key: ServiceClientPublicKey }>();
  const globalKids = new Set<string>();

  for (const record of records) {
    if (clients.has(record.client_id)) {
      throw new IdentityConfigError(`Duplicate service client_id: ${record.client_id}`);
    }

    const keys = new Map<string, ServiceClientPublicKey>();
    let activeCount = 0;

    for (const keyRecord of record.keys) {
      if (globalKids.has(keyRecord.kid)) {
        throw new IdentityConfigError(`Duplicate service-auth kid: ${keyRecord.kid}`);
      }
      globalKids.add(keyRecord.kid);

      const imported = await importPublicKey(keyRecord.public_key_pem, keyRecord.kid);
      const key: ServiceClientPublicKey = { ...imported, status: keyRecord.status };
      keys.set(keyRecord.kid, key);
      keysByKid.set(keyRecord.kid, { clientId: record.client_id, key });

      if (keyRecord.status === 'active') {
        activeCount += 1;
      }
    }

    if (activeCount < 1) {
      throw new IdentityConfigError(
        `Service client ${record.client_id} must have at least one active public key`,
      );
    }

    clients.set(record.client_id, {
      clientId: record.client_id,
      allowedAudiences: record.allowed_audiences,
      keys,
    });
  }

  return { clients, keysByKid };
}

export function getServiceClient(
  registry: ServiceClientRegistry,
  clientId: string,
): ServiceClientRecord | undefined {
  return registry.clients.get(clientId);
}

export function isAudienceAllowedForClient(client: ServiceClientRecord, audience: string): boolean {
  return client.allowedAudiences.includes(audience);
}

export function getVerifiableServiceKey(
  registry: ServiceClientRegistry,
  kid: string,
): { clientId: string; key: ServiceClientPublicKey } | undefined {
  const entry = registry.keysByKid.get(kid);
  if (entry === undefined) {
    return undefined;
  }
  if (entry.key.status === 'retired') {
    return undefined;
  }
  return entry;
}
