import { exportSPKI, generateKeyPair, importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { ActivityError } from '../../domain/errors.js';
import { loadInboundClientRegistry, verifyInboundAssertion } from './verify-inbound-assertion.js';

const CLIENT_ID = 'v2.api-gateway';
const KID = 'api-active';
const AUDIENCE = 'http://127.0.0.1:4400/activity/v1';

describe('verifyInboundAssertion', () => {
  let privatePem: string;
  let registry: Awaited<ReturnType<typeof loadInboundClientRegistry>>;
  let otherPrivatePem: string;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
      crv: 'Ed25519',
      extractable: true,
    });
    privatePem = await (await import('jose')).exportPKCS8(privateKey);
    const publicPem = await exportSPKI(publicKey);
    const other = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    otherPrivatePem = await (await import('jose')).exportPKCS8(other.privateKey);
    registry = await loadInboundClientRegistry(
      JSON.stringify([
        {
          client_id: CLIENT_ID,
          keys: [{ kid: KID, status: 'active', public_key_pem: publicPem }],
          allowed_operations: ['activity:drafts:create'],
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
    readonly issuedAtOffsetSeconds?: number;
    readonly extra?: Record<string, unknown>;
    readonly privateKeyPem?: string;
  }): Promise<string> {
    const key = await importPKCS8(options?.privateKeyPem ?? privatePem, 'EdDSA');
    const now = Math.floor(Date.now() / 1000) + (options?.issuedAtOffsetSeconds ?? 0);
    return new SignJWT({ jti: options?.jti ?? randomUUID(), ...options?.extra })
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
  });

  it('rejects expired tokens', async () => {
    const assertion = await sign({ issuedAtOffsetSeconds: -120, expiresInSeconds: 30 });
    await expect(
      verifyInboundAssertion(
        assertion,
        { expectedAudience: AUDIENCE, maxTtlSeconds: 60 },
        registry,
      ),
    ).rejects.toBeInstanceOf(ActivityError);
  });

  it('rejects future-issued tokens beyond clock skew', async () => {
    const assertion = await sign({ issuedAtOffsetSeconds: 3600 });
    await expect(
      verifyInboundAssertion(
        assertion,
        { expectedAudience: AUDIENCE, maxTtlSeconds: 60 },
        registry,
      ),
    ).rejects.toBeInstanceOf(ActivityError);
  });

  it('rejects wrong audience', async () => {
    const assertion = await sign({ aud: 'https://evil.example' });
    await expect(
      verifyInboundAssertion(
        assertion,
        { expectedAudience: AUDIENCE, maxTtlSeconds: 60 },
        registry,
      ),
    ).rejects.toMatchObject({ code: 'CLIENT_ASSERTION_INVALID' });
  });

  it('rejects audience arrays', async () => {
    const assertion = await sign({ aud: [AUDIENCE, 'https://evil.example'] });
    await expect(
      verifyInboundAssertion(
        assertion,
        { expectedAudience: AUDIENCE, maxTtlSeconds: 60 },
        registry,
      ),
    ).rejects.toMatchObject({ code: 'CLIENT_ASSERTION_INVALID' });
  });

  it('rejects iss/sub mismatch', async () => {
    const assertion = await sign({ sub: 'v2.other' });
    await expect(
      verifyInboundAssertion(
        assertion,
        { expectedAudience: AUDIENCE, maxTtlSeconds: 60 },
        registry,
      ),
    ).rejects.toMatchObject({ code: 'CLIENT_ASSERTION_INVALID' });
  });

  it('rejects the wrong issuer', async () => {
    const assertion = await sign({ iss: 'v2.other', sub: 'v2.other' });
    await expect(
      verifyInboundAssertion(
        assertion,
        { expectedAudience: AUDIENCE, maxTtlSeconds: 60 },
        registry,
      ),
    ).rejects.toMatchObject({ code: 'CLIENT_ASSERTION_INVALID' });
  });

  it('rejects a signature from the wrong key', async () => {
    const assertion = await sign({ privateKeyPem: otherPrivatePem });
    await expect(
      verifyInboundAssertion(
        assertion,
        { expectedAudience: AUDIENCE, maxTtlSeconds: 60 },
        registry,
      ),
    ).rejects.toMatchObject({ code: 'CLIENT_ASSERTION_INVALID' });
  });

  it('rejects a non-UUID jti', async () => {
    const assertion = await sign({ jti: 'not-a-uuid' });
    await expect(
      verifyInboundAssertion(
        assertion,
        { expectedAudience: AUDIENCE, maxTtlSeconds: 60 },
        registry,
      ),
    ).rejects.toMatchObject({ code: 'CLIENT_ASSERTION_INVALID' });
  });

  it('rejects a non-string actor claim', async () => {
    const assertion = await sign({ extra: { actor_discord_user_id: 42 } });
    await expect(
      verifyInboundAssertion(
        assertion,
        { expectedAudience: AUDIENCE, maxTtlSeconds: 60 },
        registry,
      ),
    ).rejects.toMatchObject({ code: 'CLIENT_ASSERTION_INVALID' });
  });
});
