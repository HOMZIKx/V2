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

  it('defaults allowed_operations to an empty deny-by-default set', () => {
    const record = registry.clients.get(CLIENT_ID);
    expect(record).toBeDefined();
    expect(record?.allowedOperations.size).toBe(0);
  });

  it('parses allowed_operations into the client record', async () => {
    const withOps = await loadInboundClientRegistry(
      JSON.stringify([
        {
          client_id: CLIENT_ID,
          keys: [{ kid: KID, status: 'active', public_key_pem: publicPem }],
          allowed_operations: ['authorize', 'identity_link'],
        },
      ]),
    );
    const record = withOps.clients.get(CLIENT_ID);
    expect(record?.allowedOperations.has('authorize')).toBe(true);
    expect(record?.allowedOperations.has('identity_link')).toBe(true);
    expect(record?.allowedOperations.has('grants')).toBe(false);
  });

  it('extracts operator actor claims when present', async () => {
    const key = await importPKCS8(privatePem, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({
      jti: randomUUID(),
      actor_v2_user_id: 'operator-v2',
      actor_discord_user_id: 'operator-d',
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: KID })
      .setIssuer(CLIENT_ID)
      .setSubject(CLIENT_ID)
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .sign(key);

    const verified = await verifyInboundAssertion(
      assertion,
      { expectedAudience: AUDIENCE, maxTtlSeconds: 60 },
      registry,
    );
    expect(verified.actorV2UserId).toBe('operator-v2');
    expect(verified.actorDiscordUserId).toBe('operator-d');
  });

  it('rejects a non-string actor claim', async () => {
    const key = await importPKCS8(privatePem, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({
      jti: randomUUID(),
      actor_v2_user_id: 42 as unknown as string,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: KID })
      .setIssuer(CLIENT_ID)
      .setSubject(CLIENT_ID)
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .sign(key);

    await expect(
      verifyInboundAssertion(
        assertion,
        { expectedAudience: AUDIENCE, maxTtlSeconds: 60 },
        registry,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
