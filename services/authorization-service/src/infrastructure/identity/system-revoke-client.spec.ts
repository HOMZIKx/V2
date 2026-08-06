import { exportPKCS8, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { AuthorizationEnv } from '../config/authorization-env.js';
import { SystemRevokeClient } from './system-revoke-client.js';

describe('SystemRevokeClient', () => {
  let privatePem: string;

  beforeAll(async () => {
    const { privateKey } = await generateKeyPair('EdDSA', {
      crv: 'Ed25519',
      extractable: true,
    });
    privatePem = await exportPKCS8(privateKey);
  });

  it('POSTs a signed assertion to the Identity revoke URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new SystemRevokeClient({
      clientId: 'v2.authorization-service',
      kid: 'authz-active',
      privateKeyPem: privatePem,
      revokeUrl: 'http://127.0.0.1:4200/identity/v1/system/revoke-sessions',
      maxTtlSeconds: 60,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await client.revokeAllSessionsForUser(
      'user-1',
      '123e4567-e89b-12d3-a456-426614174000',
      'login_entitlement_lost',
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('http://127.0.0.1:4200/identity/v1/system/revoke-sessions');
    expect(call[1].method).toBe('POST');
    const headers = call[1].headers as Record<string, string>;
    expect(headers['identity-client-assertion']).toMatch(/^eyJ/);
    const body = call[1].body;
    expect(typeof body).toBe('string');
    const parsed = JSON.parse(body as string) as {
      v2_user_id: string;
      reason: string;
      correlation_id: string;
    };
    expect(parsed.v2_user_id).toBe('user-1');
    expect(parsed.reason).toBe('login_entitlement_lost');
    expect(parsed.correlation_id).toBe('123e4567-e89b-12d3-a456-426614174000');
  });

  it('returns null fromEnv when revoke signing config is incomplete', () => {
    const config = {
      AUTHORIZATION_DATABASE_URL: 'postgresql://localhost/authorization',
      AUTHORIZATION_SERVICE_PORT: 4300,
      AUTHORIZATION_SERVICE_HOST: '127.0.0.1',
      AUTHORIZATION_BOOTSTRAP_DISCORD_USER_ID: undefined,
      AUTHORIZATION_TRUST_WINDOW_SECONDS: 120,
      AUTHORIZATION_ENABLED: false,
      AUTHORIZATION_INBOUND_CLIENTS_JSON: undefined,
      AUTHORIZATION_SYSTEM_CLIENT_ID: 'v2.authorization-service',
      AUTHORIZATION_SYSTEM_ACTIVE_KID: undefined,
      AUTHORIZATION_SYSTEM_PRIVATE_KEY_PEM: undefined,
      AUTHORIZATION_IDENTITY_BASE_URL: undefined,
      AUTHORIZATION_IDENTITY_REVOKE_URL: undefined,
      AUTHORIZATION_IDENTITY_ASSERTION_MAX_TTL_SECONDS: 60,
      AUTHORIZATION_ASSERTION_REDIS_URL: undefined,
      AUTHORIZATION_ASSERTION_REDIS_PREFIX: 'v2:authorization:client-assertion:jti:',
      AUTHORIZATION_ORGANIZATION_ID: undefined,
      AUTHORIZATION_ASSERTION_AUD: undefined,
      NODE_ENV: 'test',
    } satisfies AuthorizationEnv;

    expect(SystemRevokeClient.fromEnv(config)).toBeNull();
  });
});

describe('SystemRevokeClient assertion shape', () => {
  it('can be verified as EdDSA with matching kid', async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
      crv: 'Ed25519',
      extractable: true,
    });
    const privatePem = await exportPKCS8(privateKey);
    const assertion = await new SignJWT({ jti: randomUUID() })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
      .setIssuer('v2.authorization-service')
      .setSubject('v2.authorization-service')
      .setAudience('http://example/revoke')
      .setIssuedAt(Math.floor(Date.now() / 1000))
      .setExpirationTime(Math.floor(Date.now() / 1000) + 30)
      .sign(privateKey);

    await expect(
      jwtVerify(assertion, publicKey, {
        algorithms: ['EdDSA'],
        issuer: 'v2.authorization-service',
        audience: 'http://example/revoke',
      }),
    ).resolves.toBeTruthy();

    const client = new SystemRevokeClient({
      clientId: 'v2.authorization-service',
      kid: 'k1',
      privateKeyPem: privatePem,
      revokeUrl: 'http://example/revoke',
      maxTtlSeconds: 30,
      fetchImpl: () => Promise.resolve(new Response(null, { status: 204 })),
    });
    await expect(
      client.revokeAllSessionsForUser('u', 'corr-1', 'login_entitlement_lost'),
    ).resolves.toBeUndefined();
  });
});
