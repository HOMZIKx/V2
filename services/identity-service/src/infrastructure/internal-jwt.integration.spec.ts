import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { verifyInternalJwt } from '@v2/internal-jwt';
import { makeSignature } from 'better-auth/crypto';
import { decodeJwt } from 'jose';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../interface/app.module.js';
import { AUTH_RUNTIME, INTERNAL_JWT_RUNTIME } from '../interface/identity.tokens.js';
import type { AuthRuntime } from './auth/create-better-auth.js';
import { runMigrations } from './db/run-migrations.js';
import type { InternalJwtRuntime } from './internal-jwt/create-internal-jwt-runtime.js';
import { signTestClientAssertion } from './internal-jwt/sign-test-client-assertion.js';
import {
  buildTestInternalJwtKeyringJson,
  buildTestServiceClientsJson,
  getIdentityTestFixtures,
  TEST_GATEWAY_AUDIENCE,
  TEST_INTERNAL_JWT_ISSUE_URL,
  TEST_INTERNAL_JWT_ISSUER,
  TEST_OTHER_AUDIENCE,
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
  process.env.IDENTITY_INTERNAL_JWT_KEYRING_JSON = await buildTestInternalJwtKeyringJson({
    includeRetired: true,
  });
  process.env.IDENTITY_INTERNAL_JWT_ACTIVE_KID = fixtures.TEST_INTERNAL_ACTIVE.kid;
  process.env.IDENTITY_SERVICE_CLIENTS_JSON = await buildTestServiceClientsJson();
}

async function signedSessionCookie(runtime: AuthRuntime, token: string): Promise<string> {
  const context = await runtime.auth.$context;
  const signature = await makeSignature(token, context.secret);
  return `${context.authCookies.sessionToken.name}=${token}.${signature}`;
}

runInfra('Identity internal JWT HTTP flow', () => {
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

  it('publishes JWKS with active and retiring internal keys only', async () => {
    const response = await app.inject({ method: 'GET', url: '/identity/.well-known/jwks.json' });
    expect(response.statusCode).toBe(200);
    const body: { keys: Array<{ kid?: string }> } = response.json();
    expect(body.keys.map((key) => key.kid)).toEqual([
      fixtures.TEST_INTERNAL_ACTIVE.kid,
      fixtures.TEST_INTERNAL_RETIRING.kid,
    ]);
    expect(body.keys.map((key) => key.kid)).not.toContain(fixtures.TEST_INTERNAL_RETIRED.kid);
  });

  it('issues internal JWT with valid assertion and session', async () => {
    const context = await runtime.auth.$context;
    const email = `internal-jwt-${Date.now()}@example.com`;
    const user = await context.internalAdapter.createUser({ name: 'Internal JWT', email });
    const session = await context.internalAdapter.createSession(user.id);
    const cookie = await signedSessionCookie(runtime, session.token);

    const assertion = await signTestClientAssertion({
      config: {
        IDENTITY_INTERNAL_JWT_ISSUE_URL: TEST_INTERNAL_JWT_ISSUE_URL,
        IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS: 60,
      },
    });

    const issue = await app.inject({
      method: 'POST',
      url: '/identity/internal-token',
      headers: {
        cookie,
        'content-type': 'application/json',
        'identity-client-assertion': assertion,
      },
      payload: { audience: TEST_GATEWAY_AUDIENCE },
    });

    expect(issue.statusCode).toBe(200);
    const tokenBody: { access_token: string } = issue.json();
    const payload = decodeJwt(tokenBody.access_token);
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('roles');
    expect(payload).not.toHaveProperty('permissions');
    expect(payload).not.toHaveProperty('discord');
    expect(payload).not.toHaveProperty('sessionId');
    expect(payload).not.toHaveProperty('session_id');

    const jwks = await app.inject({
      method: 'GET',
      url: '/identity/.well-known/jwks.json',
    });
    const verified = await verifyInternalJwt({
      token: tokenBody.access_token,
      expectedIssuer: TEST_INTERNAL_JWT_ISSUER,
      expectedAudience: TEST_GATEWAY_AUDIENCE,
      jwks: jwks.json(),
    });
    expect(verified.sub).toBe(user.id);
    expect(verified.kid).toBe(fixtures.TEST_INTERNAL_ACTIVE.kid);
  });

  it('rejects missing assertion header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/identity/internal-token',
      headers: { 'content-type': 'application/json' },
      payload: { audience: TEST_GATEWAY_AUDIENCE },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects invalid session', async () => {
    const assertion = await signTestClientAssertion({
      config: {
        IDENTITY_INTERNAL_JWT_ISSUE_URL: TEST_INTERNAL_JWT_ISSUE_URL,
        IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS: 60,
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/identity/internal-token',
      headers: {
        cookie: 'v2.identity.session_token=invalid.session',
        'content-type': 'application/json',
        'identity-client-assertion': assertion,
      },
      payload: { audience: TEST_GATEWAY_AUDIENCE },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects issue after logout', async () => {
    const context = await runtime.auth.$context;
    const email = `logout-${Date.now()}@example.com`;
    const user = await context.internalAdapter.createUser({ name: 'Logout', email });
    const session = await context.internalAdapter.createSession(user.id);
    const cookie = await signedSessionCookie(runtime, session.token);

    await context.internalAdapter.deleteSession(session.token);

    const assertion = await signTestClientAssertion({
      config: {
        IDENTITY_INTERNAL_JWT_ISSUE_URL: TEST_INTERNAL_JWT_ISSUE_URL,
        IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS: 60,
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/identity/internal-token',
      headers: {
        cookie,
        'content-type': 'application/json',
        'identity-client-assertion': assertion,
      },
      payload: { audience: TEST_GATEWAY_AUDIENCE },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects disallowed target audience', async () => {
    const context = await runtime.auth.$context;
    const email = `aud-${Date.now()}@example.com`;
    const user = await context.internalAdapter.createUser({ name: 'Aud', email });
    const session = await context.internalAdapter.createSession(user.id);
    const cookie = await signedSessionCookie(runtime, session.token);
    const assertion = await signTestClientAssertion({
      config: {
        IDENTITY_INTERNAL_JWT_ISSUE_URL: TEST_INTERNAL_JWT_ISSUE_URL,
        IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS: 60,
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/identity/internal-token',
      headers: {
        cookie,
        'content-type': 'application/json',
        'identity-client-assertion': assertion,
      },
      payload: { audience: TEST_OTHER_AUDIENCE },
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects cross-client impersonation before issuing JWT', async () => {
    const context = await runtime.auth.$context;
    const email = `impersonate-${Date.now()}@example.com`;
    const user = await context.internalAdapter.createUser({ name: 'Impersonate', email });
    const session = await context.internalAdapter.createSession(user.id);
    const cookie = await signedSessionCookie(runtime, session.token);

    const assertion = await signTestClientAssertion({
      config: {
        IDENTITY_INTERNAL_JWT_ISSUE_URL: TEST_INTERNAL_JWT_ISSUE_URL,
        IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS: 60,
      },
      privatePem: fixtures.TEST_SERVICE_GATEWAY_ACTIVE.privatePem,
      kid: fixtures.TEST_SERVICE_GATEWAY_ACTIVE.kid,
      iss: 'v2.other-service',
      sub: 'v2.other-service',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/identity/internal-token',
      headers: {
        cookie,
        'content-type': 'application/json',
        'identity-client-assertion': assertion,
      },
      payload: { audience: TEST_OTHER_AUDIENCE },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'CLIENT_ASSERTION_INVALID' } });
  });

  it('rejects assertion replay', async () => {
    const context = await runtime.auth.$context;
    const email = `replay-${Date.now()}@example.com`;
    const user = await context.internalAdapter.createUser({ name: 'Replay', email });
    const session = await context.internalAdapter.createSession(user.id);
    const cookie = await signedSessionCookie(runtime, session.token);
    const jti = randomUUID();
    const assertion = await signTestClientAssertion({
      config: {
        IDENTITY_INTERNAL_JWT_ISSUE_URL: TEST_INTERNAL_JWT_ISSUE_URL,
        IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS: 60,
      },
      jti,
    });

    const first = await app.inject({
      method: 'POST',
      url: '/identity/internal-token',
      headers: {
        cookie,
        'content-type': 'application/json',
        'identity-client-assertion': assertion,
      },
      payload: { audience: TEST_GATEWAY_AUDIENCE },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/identity/internal-token',
      headers: {
        cookie,
        'content-type': 'application/json',
        'identity-client-assertion': assertion,
      },
      payload: { audience: TEST_GATEWAY_AUDIENCE },
    });
    expect(second.statusCode).toBe(401);
    expect(second.json()).toMatchObject({ error: { code: 'CLIENT_ASSERTION_REPLAY' } });
  });
});

runInfra('Identity internal JWT Redis lifecycle', () => {
  it('closes assertion Redis store exactly once on app.close', async () => {
    const fixtures = await getIdentityTestFixtures();
    await applyInternalJwtEnv(fixtures);
    await runMigrations({ connectionString: databaseUrl, migrationsDir });

    const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
    });
    await app.init();

    const jwtRuntime = app.get<InternalJwtRuntime | null>(INTERNAL_JWT_RUNTIME);
    if (jwtRuntime === null) {
      throw new Error('INTERNAL_JWT_RUNTIME was null');
    }
    const authRuntime = app.get<AuthRuntime | null>(AUTH_RUNTIME);
    const closeSpy = vi.spyOn(jwtRuntime.assertionJtiStore, 'close');

    await app.close();
    expect(closeSpy).toHaveBeenCalledTimes(1);

    await authRuntime?.close().catch(() => undefined);
  });
});
