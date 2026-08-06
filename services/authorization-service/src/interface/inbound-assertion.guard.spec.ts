import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { exportSPKI, generateKeyPair, importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { AuthorizationError } from '../domain/errors.js';
import type { AuthorizationEnv } from '../infrastructure/config/authorization-env.js';
import {
  type InboundClientRegistry,
  loadInboundClientRegistry,
} from '../infrastructure/internal/verify-inbound-assertion.js';
import { type AuthenticatedRequest, InboundAssertionGuard } from './inbound-assertion.guard.js';

const CLIENT_ID = 'v2.identity-service';
const KID = 'identity-active';
const AUDIENCE = 'http://127.0.0.1:4300/authorization/v1/authorize';

function baseConfig(overrides: Partial<AuthorizationEnv> = {}): AuthorizationEnv {
  return {
    AUTHORIZATION_ENABLED: true,
    AUTHORIZATION_ASSERTION_AUD: AUDIENCE,
    AUTHORIZATION_IDENTITY_ASSERTION_MAX_TTL_SECONDS: 60,
    ...overrides,
  } as unknown as AuthorizationEnv;
}

function makeContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function makeReflector(operation?: string): Reflector {
  return { get: () => operation } as unknown as Reflector;
}

describe('InboundAssertionGuard', () => {
  let privatePem: string;
  let registry: InboundClientRegistry;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
      crv: 'Ed25519',
      extractable: true,
    });
    privatePem = await (await import('jose')).exportPKCS8(privateKey);
    const publicPem = await exportSPKI(publicKey);
    registry = await loadInboundClientRegistry(
      JSON.stringify([
        {
          client_id: CLIENT_ID,
          keys: [{ kid: KID, status: 'active', public_key_pem: publicPem }],
          allowed_operations: ['authorize', 'identity_link'],
        },
      ]),
    );
  });

  async function sign(claims: Record<string, unknown> = {}): Promise<string> {
    const key = await importPKCS8(privatePem, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ jti: randomUUID(), ...claims })
      .setProtectedHeader({ alg: 'EdDSA', kid: KID })
      .setIssuer(CLIENT_ID)
      .setSubject(CLIENT_ID)
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .sign(key);
  }

  function request(assertion?: string): AuthenticatedRequest {
    return {
      headers: assertion !== undefined ? { 'authorization-client-assertion': assertion } : {},
      url: '/authorization/v1/authorize',
      protocol: 'http',
    } as unknown as AuthenticatedRequest;
  }

  it('bypasses verification entirely when authorization is disabled', async () => {
    const guard = new InboundAssertionGuard(
      baseConfig({ AUTHORIZATION_ENABLED: false }),
      null,
      null,
      makeReflector('authorize'),
    );
    await expect(guard.canActivate(makeContext(request()))).resolves.toBe(true);
  });

  it('accepts an allowlisted operation and stores client + actor on the request', async () => {
    const guard = new InboundAssertionGuard(
      baseConfig(),
      registry,
      null,
      makeReflector('authorize'),
    );
    const assertion = await sign({ actor_v2_user_id: 'op-v2', actor_discord_user_id: 'op-d' });
    const req = request(assertion);

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.verifiedClientId).toBe(CLIENT_ID);
    expect(req.verifiedActor).toEqual({ v2UserId: 'op-v2', discordUserId: 'op-d' });
  });

  it('rejects an operation the client is not allowlisted for', async () => {
    const guard = new InboundAssertionGuard(baseConfig(), registry, null, makeReflector('grants'));
    const assertion = await sign();
    await expect(guard.canActivate(makeContext(request(assertion)))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rejects a missing assertion header when enabled', async () => {
    const guard = new InboundAssertionGuard(
      baseConfig(),
      registry,
      null,
      makeReflector('authorize'),
    );
    await expect(guard.canActivate(makeContext(request()))).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });
});
