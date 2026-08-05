import { exportJWK, importPKCS8, importSPKI, type JWK } from 'jose';
import { z } from 'zod';

import { IdentityConfigError } from '../config/identity-env.js';

type KeyStatus = 'active' | 'retiring' | 'retired';

/**
 * Keyring record model (fail-closed):
 * - active: requires private_key_pem + public_key_pem (only status that may sign)
 * - retiring / retired: public_key_pem only; private_key_pem is rejected if present
 * - JWKS publishes active + retiring (never retired)
 */
const activeKeyRecordSchema = z
  .object({
    kid: z.string().min(1),
    status: z.literal('active'),
    private_key_pem: z.string().min(1),
    public_key_pem: z.string().min(1),
  })
  .strict();

const publicOnlyKeyRecordSchema = z
  .object({
    kid: z.string().min(1),
    status: z.enum(['retiring', 'retired']),
    public_key_pem: z.string().min(1),
  })
  .strict();

const internalJwtKeyRecordSchema = z.union([activeKeyRecordSchema, publicOnlyKeyRecordSchema]);

export interface InternalJwtKeyEntry {
  readonly kid: string;
  readonly status: KeyStatus;
  readonly publicJwk: JWK;
  /** Present only for the single active signer; CryptoKey is non-extractable. */
  readonly signingKey?: Awaited<ReturnType<typeof importPKCS8>>;
}

export interface InternalJwtSigningKey extends InternalJwtKeyEntry {
  readonly status: 'active';
  readonly signingKey: Awaited<ReturnType<typeof importPKCS8>>;
}

export interface InternalJwtKeyring {
  readonly activeKid: string;
  readonly keys: ReadonlyMap<string, InternalJwtKeyEntry>;
  readonly jwks: { readonly keys: readonly JWK[] };
}

async function importPublicOnly(publicPem: string, kid: string): Promise<JWK> {
  const publicKey = await importSPKI(publicPem, 'EdDSA');
  const publicJwk = await exportJWK(publicKey);
  return { ...publicJwk, kid, alg: 'EdDSA', use: 'sig' };
}

/**
 * Temporarily import the PKCS#8 material as extractable to compare the public
 * component, discard that import, then re-import as non-extractable for signing.
 */
async function importActiveSigningPair(
  pkcs8Pem: string,
  spkiPem: string,
  kid: string,
): Promise<{ publicJwk: JWK; signingKey: Awaited<ReturnType<typeof importPKCS8>> }> {
  const extractableForCheck = await importPKCS8(pkcs8Pem, 'EdDSA', { extractable: true });
  const publicKey = await importSPKI(spkiPem, 'EdDSA');
  const derivedPublic = await exportJWK(extractableForCheck);
  const publicJwk = await exportJWK(publicKey);
  if (derivedPublic.x !== publicJwk.x) {
    throw new IdentityConfigError(`Internal JWT keyring kid=${kid}: private/public key mismatch`);
  }
  const signingKey = await importPKCS8(pkcs8Pem, 'EdDSA', { extractable: false });
  return {
    publicJwk: { ...publicJwk, kid, alg: 'EdDSA', use: 'sig' },
    signingKey,
  };
}

export async function loadInternalJwtKeyring(
  keyringJson: string,
  activeKid: string,
): Promise<InternalJwtKeyring> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(keyringJson);
  } catch {
    throw new IdentityConfigError('IDENTITY_INTERNAL_JWT_KEYRING_JSON must be valid JSON');
  }

  const records = z.array(internalJwtKeyRecordSchema).min(1).parse(parsed);
  const kids = new Set<string>();
  const keys = new Map<string, InternalJwtKeyEntry>();
  let activeCount = 0;

  for (const record of records) {
    if (kids.has(record.kid)) {
      throw new IdentityConfigError(`Duplicate internal JWT kid: ${record.kid}`);
    }
    kids.add(record.kid);

    if (record.status === 'active') {
      activeCount += 1;
      const { publicJwk, signingKey } = await importActiveSigningPair(
        record.private_key_pem,
        record.public_key_pem,
        record.kid,
      );
      keys.set(record.kid, {
        kid: record.kid,
        status: 'active',
        publicJwk,
        signingKey,
      });
      continue;
    }

    if ('private_key_pem' in record) {
      throw new IdentityConfigError(
        `Internal JWT keyring kid=${record.kid}: ${record.status} keys must not include private_key_pem`,
      );
    }

    const publicJwk = await importPublicOnly(record.public_key_pem, record.kid);
    keys.set(record.kid, {
      kid: record.kid,
      status: record.status,
      publicJwk,
    });
  }

  if (activeCount !== 1) {
    throw new IdentityConfigError(
      `Internal JWT keyring must have exactly one active key (found ${activeCount})`,
    );
  }

  const active = keys.get(activeKid);
  if (active === undefined || active.status !== 'active' || active.signingKey === undefined) {
    throw new IdentityConfigError(
      'IDENTITY_INTERNAL_JWT_ACTIVE_KID must reference the single active internal JWT key',
    );
  }

  const jwksKeys = [...keys.values()]
    .filter((entry) => entry.status === 'active' || entry.status === 'retiring')
    .map((entry) => entry.publicJwk);

  if (jwksKeys.length === 0) {
    throw new IdentityConfigError('Internal JWT JWKS would be empty when feature is enabled');
  }

  return { activeKid, keys, jwks: { keys: jwksKeys } };
}

export function getActiveSigningKey(keyring: InternalJwtKeyring): InternalJwtSigningKey {
  const key = keyring.keys.get(keyring.activeKid);
  if (key === undefined || key.status !== 'active' || key.signingKey === undefined) {
    throw new IdentityConfigError('Active internal JWT signing key is missing');
  }
  return key as InternalJwtSigningKey;
}
