import { exportSPKI, generateKeyPair, importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { AuthorizationError } from '../../domain/errors.js';
import { loadInboundClientRegistry, verifyInboundAssertion } from './verify-inbound-assertion.js';

const CLIENT_ID = 'v2.identity-service';
const KID = 'identity-active';
const AUDIENCE = 'http://127.0.0.1:4300/authorization/v1/authorize';

describe('verifyInboundAssertion', () => {
  let privatePem: string;
  let publicPem: string;
  let registry: Awaited<ReturnType<typeof loadInboundClientRegistry>>;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
      crv: 'Ed25519',
      extractable: true,
    });
    privatePem = await (await import('jose')).exportPKCS8(privateKey);
    publicPem = await exportSPKI(publicKey);
    registry = await loadInboundClientRegistry(
      JSON.stringify([
        {
          client_id: CLIENT_ID,
          keys: [{ kid: KID, status: 'active', public_key_pem: publicPem }],
        },
      ]),
    );
  });

  async function sign(options?: {
    readonly aud?: string | string[];
    readonly iss?: string;
    readonly sub?: string;
    readonly jti?: string;
    readonly expiresInSeconds?: number;
  }): Promise<string> {
    const key = await importPKCS8(privatePem, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ jti: options?.jti ?? randomUUID() })
      .setProtectedHeader({ alg: 'EdDSA', kid: KID })
      .setIssuer(options?.iss ?? CLIENT_ID)
      .setSubject(options?.sub ?? CLIENT_ID)
      .setAudience(options?.aud ?? AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + (options?.expiresInSeconds ?? 60))
      .sign(key);
  }

  it('accepts a valid assertion', async () => {
    const assertion = await sign();
    const verified = await verifyInboundAssertion(
      assertion,
      { expectedAudience: AUDIENCE, maxTtlSeconds: 60 },
      registry,
    );
    expect(verified.clientId).toBe(CLIENT_ID);
    expect(verified.kid).toBe(KID);
  });

  it('rejects audience arrays', async () => {
    const assertion = await sign({ aud: [AUDIENCE, 'https://evil.example'] });
    await expect(
      verifyInboundAssertion(
        assertion,
        { expectedAudience: AUDIENCE, maxTtlSeconds: 60 },
        registry,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('rejects iss/sub mismatch and wrong client binding', async () => {
    const assertion = await sign({ iss: 'v2.other', sub: 'v2.other' });
    await expect(
      verifyInboundAssertion(
        assertion,
        { expectedAudience: AUDIENCE, maxTtlSeconds: 60 },
        registry,
      ),
    ).rejects.toMatchObject({ code: 'CLIENT_ASSERTION_INVALID' });
  });

  it('rejects invalid jti', async () => {
    const assertion = await sign({ jti: 'not-a-uuid' });
    await expect(
      verifyInboundAssertion(
        assertion,
        { expectedAudience: AUDIENCE, maxTtlSeconds: 60 },
        registry,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
