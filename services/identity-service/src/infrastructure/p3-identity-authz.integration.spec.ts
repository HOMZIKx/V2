import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { APIError } from 'better-auth';
import { makeSignature } from 'better-auth/crypto';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../interface/app.module.js';
import { AUTH_RUNTIME } from '../interface/identity.tokens.js';
import type { AuthRuntime } from './auth/create-better-auth.js';
import { createBetterAuth } from './auth/create-better-auth.js';
import type { AuthorizationClient } from './authorization/authorization-client.js';
import { type IdentityEnv, parseIdentityEnv } from './config/identity-env.js';
import { runMigrations } from './db/run-migrations.js';
import { signTestClientAssertion } from './internal-jwt/sign-test-client-assertion.js';
import {
  buildTestInternalJwtKeyringJson,
  buildTestServiceClientsJson,
  getIdentityTestFixtures,
  TEST_AUTHZ_CLIENT_ID,
  TEST_INTERNAL_JWT_ISSUE_URL,
  TEST_INTERNAL_JWT_ISSUER,
  TEST_SYSTEM_REVOKE_URL,
  type IdentityInternalJwtTestFixtures,
} from './internal-jwt/test-fixtures.js';

const runInfra = process.env.RUN_INFRA_TESTS === 'true' ? describe : describe.skip;

const databaseUrl =
  process.env.IDENTITY_DATABASE_URL ??
  'postgresql://identity:identity_dev_password@127.0.0.1:5432/identity';
const redisUrl = process.env.IDENTITY_REDIS_URL ?? 'redis://127.0.0.1:6379/1';
const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations',
);

const TEST_SECRET = 'test-secret-value-that-is-at-least-32-bytes';

async function applyInternalJwtEnv(fixtures: IdentityInternalJwtTestFixtures): Promise<void> {
  process.env.IDENTITY_AUTH_ENABLED = 'true';
  process.env.IDENTITY_INTERNAL_JWT_ENABLED = 'true';
  process.env.IDENTITY_AUTHORIZATION_ENABLED = 'false';
  process.env.IDENTITY_DATABASE_URL = databaseUrl;
  process.env.IDENTITY_REDIS_URL = redisUrl;
  process.env.IDENTITY_AUTH_BASE_URL = 'http://127.0.0.1:4200';
  process.env.IDENTITY_AUTH_BASE_PATH = '/api/auth';
  process.env.IDENTITY_TRUSTED_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000';
  process.env.IDENTITY_BETTER_AUTH_SECRET = TEST_SECRET;
  process.env.IDENTITY_DISCORD_CLIENT_ID = 'test-discord-id';
  process.env.IDENTITY_DISCORD_CLIENT_SECRET = 'test-discord-secret';
  process.env.IDENTITY_PROOF_UI_ENABLED = 'false';
  process.env.NODE_ENV = 'development';
  process.env.IDENTITY_INTERNAL_JWT_ISSUER = TEST_INTERNAL_JWT_ISSUER;
  process.env.IDENTITY_INTERNAL_JWT_ISSUE_URL = TEST_INTERNAL_JWT_ISSUE_URL;
  process.env.IDENTITY_SYSTEM_REVOKE_URL = TEST_SYSTEM_REVOKE_URL;
  process.env.IDENTITY_INTERNAL_JWT_KEYRING_JSON = await buildTestInternalJwtKeyringJson({
    includeRetired: true,
  });
  process.env.IDENTITY_INTERNAL_JWT_ACTIVE_KID = fixtures.TEST_INTERNAL_ACTIVE.kid;
  process.env.IDENTITY_SERVICE_CLIENTS_JSON = await buildTestServiceClientsJson();
}

runInfra('Identity system revoke + login entitlement (infra)', () => {
  let app: NestFastifyApplication;
  let runtime: AuthRuntime;
  let fixtures: IdentityInternalJwtTestFixtures;

  beforeAll(async () => {
    fixtures = await getIdentityTestFixtures();
    await applyInternalJwtEnv(fixtures);
    await runMigrations({ connectionString: databaseUrl, migrationsDir });

    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const resolved = app.get<AuthRuntime | null>(AUTH_RUNTIME);
    if (resolved === null) {
      throw new Error('AUTH_RUNTIME was null');
    }
    runtime = resolved;
  });

  afterAll(async () => {
    await app.close().catch(() => undefined);
    await runtime.close().catch(() => undefined);
  });

  it('revokes all sessions with a valid Authz client assertion', async () => {
    const context = await runtime.auth.$context;
    const email = `revoke-${Date.now()}@example.com`;
    const user = await context.internalAdapter.createUser({ name: 'Revoke Target', email });
    const session = await context.internalAdapter.createSession(user.id);
    expect(await context.internalAdapter.findSession(session.token)).not.toBeNull();

    const assertion = await signTestClientAssertion({
      config: { IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS: 60 },
      clientId: TEST_AUTHZ_CLIENT_ID,
      kid: fixtures.TEST_SERVICE_AUTHZ_ACTIVE.kid,
      privatePem: fixtures.TEST_SERVICE_AUTHZ_ACTIVE.privatePem,
      audience: TEST_SYSTEM_REVOKE_URL,
    });

    const correlationId = randomUUID();
    const response = await app.inject({
      method: 'POST',
      url: '/identity/v1/system/revoke-sessions',
      headers: {
        'content-type': 'application/json',
        'identity-client-assertion': assertion,
      },
      payload: {
        v2_user_id: user.id,
        reason: 'test revoke',
        correlation_id: correlationId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      revoked_user_id: user.id,
      correlation_id: correlationId,
    });
    expect(await context.internalAdapter.findSession(session.token)).toBeNull();
  });

  it('rejects system revoke without assertion (user cookie alone is insufficient)', async () => {
    const context = await runtime.auth.$context;
    const email = `revoke-cookie-${Date.now()}@example.com`;
    const user = await context.internalAdapter.createUser({ name: 'Cookie Only', email });
    const session = await context.internalAdapter.createSession(user.id);
    const signature = await makeSignature(session.token, context.secret);
    const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${signature}`;

    const response = await app.inject({
      method: 'POST',
      url: '/identity/v1/system/revoke-sessions',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      payload: {
        v2_user_id: user.id,
        reason: 'should fail',
        correlation_id: randomUUID(),
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: 'CLIENT_ASSERTION_INVALID' },
    });
    expect(await context.internalAdapter.findSession(session.token)).not.toBeNull();
  });

  it('rejects assertion replay on system revoke', async () => {
    const context = await runtime.auth.$context;
    const email = `revoke-replay-${Date.now()}@example.com`;
    const user = await context.internalAdapter.createUser({ name: 'Replay Target', email });

    const jti = randomUUID();
    const assertion = await signTestClientAssertion({
      config: { IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS: 60 },
      clientId: TEST_AUTHZ_CLIENT_ID,
      kid: fixtures.TEST_SERVICE_AUTHZ_ACTIVE.kid,
      privatePem: fixtures.TEST_SERVICE_AUTHZ_ACTIVE.privatePem,
      audience: TEST_SYSTEM_REVOKE_URL,
      jti,
    });

    const first = await app.inject({
      method: 'POST',
      url: '/identity/v1/system/revoke-sessions',
      headers: {
        'content-type': 'application/json',
        'identity-client-assertion': assertion,
      },
      payload: {
        v2_user_id: user.id,
        reason: 'first',
        correlation_id: randomUUID(),
      },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/identity/v1/system/revoke-sessions',
      headers: {
        'content-type': 'application/json',
        'identity-client-assertion': assertion,
      },
      payload: {
        v2_user_id: user.id,
        reason: 'replay',
        correlation_id: randomUUID(),
      },
    });
    expect(second.statusCode).toBe(401);
    expect(second.json()).toMatchObject({
      error: { code: 'CLIENT_ASSERTION_REPLAY' },
    });
  });
});

runInfra('Login entitlement gate leaves no session on deny', () => {
  it('keeps the V2 user but does not persist a session when Authz denies login', async () => {
    await runMigrations({ connectionString: databaseUrl, migrationsDir });

    const denyUpsert = vi.fn().mockResolvedValue(undefined);
    const denyAuthorize = vi.fn().mockResolvedValue('deny');
    const denyClient: AuthorizationClient = {
      upsertIdentityLink: denyUpsert,
      authorizeWwwLogin: denyAuthorize,
    };

    const fixtures = await getIdentityTestFixtures();
    const config: IdentityEnv = parseIdentityEnv({
      IDENTITY_AUTH_ENABLED: 'true',
      IDENTITY_AUTHORIZATION_ENABLED: 'true',
      IDENTITY_AUTHORIZATION_BASE_URL: 'http://127.0.0.1:4300',
      IDENTITY_AUTHORIZATION_ASSERTION_AUD: 'http://127.0.0.1:4300/authorization/v1',
      IDENTITY_TO_AUTHZ_CLIENT_ID: 'v2.identity-service',
      IDENTITY_TO_AUTHZ_PRIVATE_KEY_PEM: fixtures.TEST_SERVICE_GATEWAY_ACTIVE.privatePem,
      IDENTITY_TO_AUTHZ_ACTIVE_KID: fixtures.TEST_SERVICE_GATEWAY_ACTIVE.kid,
      IDENTITY_DATABASE_URL: databaseUrl,
      IDENTITY_REDIS_URL: redisUrl,
      IDENTITY_AUTH_BASE_URL: 'http://127.0.0.1:4200',
      IDENTITY_TRUSTED_ORIGINS: 'http://localhost:3000',
      IDENTITY_BETTER_AUTH_SECRET: TEST_SECRET,
      IDENTITY_DISCORD_CLIENT_ID: 'test-discord-id',
      IDENTITY_DISCORD_CLIENT_SECRET: 'test-discord-secret',
    });

    const localRuntime = createBetterAuth(config, { authorizationClient: denyClient });
    try {
      const context = await localRuntime.auth.$context;
      const email = `login-deny-${Date.now()}@example.com`;
      const user = await context.internalAdapter.createUser({ name: 'Denied Login', email });
      await context.internalAdapter.linkAccount({
        userId: user.id,
        providerId: 'discord',
        accountId: `discord-deny-${Date.now()}`,
        accessToken: null,
        refreshToken: null,
        idToken: null,
        scope: 'identify',
      });

      await expect(context.internalAdapter.createSession(user.id)).rejects.toBeInstanceOf(APIError);

      const redisKeys = await localRuntime.redis.keys(`v2:identity:auth:*${user.id}*`);
      const userSessions = await context.internalAdapter.listSessions(user.id);
      expect(userSessions).toEqual([]);
      expect(redisKeys.length).toBe(0);

      const stillThere = await context.internalAdapter.findUserById(user.id);
      expect(stillThere?.id).toBe(user.id);
      expect(denyUpsert).toHaveBeenCalled();
      expect(denyAuthorize).toHaveBeenCalled();
    } finally {
      await localRuntime.close();
    }
  });
});
