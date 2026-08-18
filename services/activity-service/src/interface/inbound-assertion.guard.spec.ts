import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { exportSPKI, generateKeyPair, importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { ActivityError } from '../domain/errors.js';
import type { ActivityEnv } from '../infrastructure/config/activity-env.js';
import { MemoryAssertionJtiStore } from '../infrastructure/internal/assertion-jti-store.js';
import {
  type InboundClientRegistry,
  loadInboundClientRegistry,
} from '../infrastructure/internal/verify-inbound-assertion.js';
import { type AuthenticatedRequest, InboundAssertionGuard } from './inbound-assertion.guard.js';

const CLIENT_ID = 'v2.discord-gateway';
const KID = 'discord-active';
const AUDIENCE = 'http://127.0.0.1:4400/activity/v1';

function baseConfig(overrides: Partial<ActivityEnv> = {}): ActivityEnv {
  return {
    ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
    ACTIVITY_SERVICE_PORT: 4400,
    ACTIVITY_SERVICE_HOST: '127.0.0.1',
    ACTIVITY_ENABLED: false,
    ACTIVITY_OUTBOX_WORKER_ENABLED: false,
    ACTIVITY_AUTHORIZATION_BASE_URL: undefined,
    ACTIVITY_AUTHORIZATION_ASSERTION_AUD: undefined,
    ACTIVITY_TO_AUTHZ_CLIENT_ID: 'v2.activity-service',
    ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM: undefined,
    ACTIVITY_TO_AUTHZ_ACTIVE_KID: undefined,
    ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS: 60,
    ACTIVITY_INBOUND_CLIENTS_JSON: undefined,
    ACTIVITY_INBOUND_CLIENTS_B64: undefined,
    ACTIVITY_ASSERTION_AUD: AUDIENCE,
    ACTIVITY_DISCORD_PROJECTION_BASE_URL: undefined,
    ACTIVITY_DISCORD_GATEWAY_BASE_URL: undefined,
    ACTIVITY_PROJECTION_SHARED_SECRET: undefined,
    ACTIVITY_TO_DISCORD_CLIENT_ID: 'v2.activity-service',
    ACTIVITY_TO_DISCORD_PRIVATE_KEY_PEM: undefined,
    ACTIVITY_TO_DISCORD_ACTIVE_KID: undefined,
    ACTIVITY_DISCORD_ASSERTION_AUD: undefined,
    ACTIVITY_ALLOW_TEST_SEED: false,
    ACTIVITY_TRUST_ACTOR_HEADERS: false,
    ACTIVITY_REDIS_URL: undefined,
    ACTIVITY_ASSERTION_JTI_REDIS_PREFIX: 'v2:activity:client-assertion:jti:',
    NODE_ENV: 'development',
    ...overrides,
  };
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
          allowed_operations: ['activity:drafts:create'],
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

  function request(headers: Record<string, string> = {}): AuthenticatedRequest {
    return {
      headers,
      url: '/activity/v1/drafts',
      protocol: 'http',
    } as unknown as AuthenticatedRequest;
  }

  it('rejects forged actor headers when TRUST=false', async () => {
    const guard = new InboundAssertionGuard(
      baseConfig({ ACTIVITY_TRUST_ACTOR_HEADERS: false }),
      null,
      null,
      makeReflector(),
    );

    await expect(
      guard.canActivate(
        makeContext(
          request({
            'x-actor-discord-user-id': 'attacker',
          }),
        ),
      ),
    ).rejects.toMatchObject({
      code: 'CLIENT_ASSERTION_INVALID',
    });
  });

  it('accepts actor headers when TRUST=true in non-production', async () => {
    const guard = new InboundAssertionGuard(
      baseConfig({ ACTIVITY_TRUST_ACTOR_HEADERS: true, NODE_ENV: 'test' }),
      null,
      null,
      makeReflector(),
    );
    const req = request({ 'x-actor-discord-user-id': 'dev-user' });

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.verifiedActor).toEqual({ discordUserId: 'dev-user' });
  });

  it('ignores forged actor headers after a verified assertion', async () => {
    const guard = new InboundAssertionGuard(
      baseConfig({ ACTIVITY_ENABLED: false }),
      registry,
      new MemoryAssertionJtiStore(),
      makeReflector(),
    );
    const token = await sign({ actor_discord_user_id: 'from-jwt' });
    const req = request({
      'activity-client-assertion': token,
      'x-actor-discord-user-id': 'from-header',
    });

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.verifiedActor).toEqual({ discordUserId: 'from-jwt' });
  });

  it('rejects duplicate assertion headers', async () => {
    const token = await sign({ actor_discord_user_id: '111' });
    const guard = new InboundAssertionGuard(
      baseConfig({ ACTIVITY_ENABLED: false }),
      registry,
      new MemoryAssertionJtiStore(),
      makeReflector(),
    );
    const req = {
      headers: { 'activity-client-assertion': [token, token] },
      url: '/activity/v1/drafts',
      protocol: 'http',
    } as unknown as AuthenticatedRequest;

    await expect(guard.canActivate(makeContext(req))).rejects.toMatchObject({
      code: 'CLIENT_ASSERTION_INVALID',
    });
  });

  it('requires a JTI store in production when inbound registry is configured', async () => {
    const guard = new InboundAssertionGuard(
      baseConfig({ NODE_ENV: 'production', ACTIVITY_ENABLED: false }),
      registry,
      null,
      makeReflector(),
    );
    const token = await sign({ actor_discord_user_id: '111' });
    await expect(
      guard.canActivate(makeContext(request({ 'activity-client-assertion': token }))),
    ).rejects.toMatchObject({ code: 'CONFIG_INVALID' });
  });

  it('accepts assertion when ACTIVITY_ENABLED=false but inbound registry is configured', async () => {
    const guard = new InboundAssertionGuard(
      baseConfig({ ACTIVITY_ENABLED: false }),
      registry,
      null,
      makeReflector(),
    );
    const token = await sign({ actor_discord_user_id: '111' });
    const req = request({ 'activity-client-assertion': token });

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.verifiedActor).toEqual({ discordUserId: '111' });
  });

  it('accepts first assertion jti and rejects replay', async () => {
    const jtiStore = new MemoryAssertionJtiStore();
    const guard = new InboundAssertionGuard(
      baseConfig({ ACTIVITY_ENABLED: true }),
      registry,
      jtiStore,
      makeReflector(),
    );
    const token = await sign({ actor_discord_user_id: '111' });
    const req = request({ 'activity-client-assertion': token });

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    await expect(guard.canActivate(makeContext(req))).rejects.toMatchObject({
      code: 'CLIENT_ASSERTION_REPLAY',
    });
    await jtiStore.close();
  });

  it('fails one of concurrent double-assert attempts on the same jti', async () => {
    const jtiStore = new MemoryAssertionJtiStore();
    const guard = new InboundAssertionGuard(
      baseConfig({ ACTIVITY_ENABLED: true }),
      registry,
      jtiStore,
      makeReflector(),
    );
    const sharedJti = randomUUID();
    const token = await sign({ jti: sharedJti, actor_discord_user_id: '111' });
    const req = request({ 'activity-client-assertion': token });

    const results = await Promise.allSettled([
      guard.canActivate(makeContext(req)),
      guard.canActivate(makeContext(req)),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ActivityError);
    await jtiStore.close();
  });
});
