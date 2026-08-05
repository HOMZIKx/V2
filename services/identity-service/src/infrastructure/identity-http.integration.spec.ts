import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { makeSignature } from 'better-auth/crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../interface/app.module.js';
import { AUTH_RUNTIME } from '../interface/identity.tokens.js';
import type { AuthRuntime } from './auth/create-better-auth.js';
import { runMigrations } from './db/run-migrations.js';

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

function applyAuthEnv(): void {
  process.env.IDENTITY_AUTH_ENABLED = 'true';
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
}

async function signedSessionCookie(runtime: AuthRuntime, token: string): Promise<string> {
  const context = await runtime.auth.$context;
  const signature = await makeSignature(token, context.secret);
  return `${context.authCookies.sessionToken.name}=${token}.${signature}`;
}

function collectSetCookies(headers: object): string[] {
  const record = headers as Record<string, unknown>;
  const raw = record['set-cookie'];
  if (raw === undefined || raw === null) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === 'string');
  }
  if (typeof raw === 'string') {
    return [raw];
  }
  return [];
}

runInfra('Identity Nest/Fastify HTTP mount', () => {
  let app: NestFastifyApplication;
  let runtime: AuthRuntime;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    applyAuthEnv();
    await runMigrations({ connectionString: databaseUrl, migrationsDir });

    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const resolved = app.get<AuthRuntime | null>(AUTH_RUNTIME);
    if (resolved === null) {
      throw new Error('AUTH_RUNTIME was null with IDENTITY_AUTH_ENABLED=true');
    }
    runtime = resolved;
  });

  afterAll(async () => {
    await app.close().catch(() => undefined);
    await runtime.close().catch(() => undefined);
  });

  it('routes Better Auth GET/POST through the mounted handler with status and cookies', async () => {
    const start = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      headers: {
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      payload: {
        provider: 'discord',
        callbackURL: 'http://127.0.0.1:4200/identity/proof',
      },
    });

    expect([200, 302]).toContain(start.statusCode);
    const cookies = collectSetCookies(start.headers);
    expect(cookies.length).toBeGreaterThan(0);

    const sessionProbe = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { origin: 'http://localhost:3000' },
    });
    expect(sessionProbe.statusCode).toBe(200);
  });

  it('rejects a foreign Origin on the auth mount (CORS allowlist)', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/get-session',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'GET',
      },
    });

    const allowOrigin = response.headers['access-control-allow-origin'];
    expect(allowOrigin).toBeUndefined();
  });

  it('uses a session cookie for /identity/me, clears cookies on logout, and revokes Redis', async () => {
    const context = await runtime.auth.$context;
    const email = `http-me-${Date.now()}@example.com`;
    const user = await context.internalAdapter.createUser({ name: 'Http Me', email });
    createdUserIds.push(user.id);

    const session = await context.internalAdapter.createSession(user.id);
    const cookie = await signedSessionCookie(runtime, session.token);

    const me = await app.inject({
      method: 'GET',
      url: '/identity/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ id: user.id, email });

    const beforeLogout = await context.internalAdapter.findSession(session.token);
    expect(beforeLogout?.session.userId).toBe(user.id);

    const logout = await app.inject({
      method: 'POST',
      url: '/identity/logout',
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ status: 'ok' });

    const clearCookies = collectSetCookies(logout.headers);
    expect(clearCookies.length).toBeGreaterThan(0);
    expect(clearCookies.some((entry) => /max-age=0/i.test(entry) || /expires=/i.test(entry))).toBe(
      true,
    );

    const afterLogout = await context.internalAdapter.findSession(session.token);
    expect(afterLogout).toBeNull();

    const meAgain = await app.inject({
      method: 'GET',
      url: '/identity/me',
      headers: { cookie },
    });
    expect(meAgain.statusCode).toBe(401);
  });

  it('rejects a foreign callbackURL on /identity/link', async () => {
    const context = await runtime.auth.$context;
    const email = `http-link-${Date.now()}@example.com`;
    const user = await context.internalAdapter.createUser({ name: 'Http Link', email });
    createdUserIds.push(user.id);
    const session = await context.internalAdapter.createSession(user.id);
    const cookie = await signedSessionCookie(runtime, session.token);

    const response = await app.inject({
      method: 'POST',
      url: '/identity/link/discord',
      headers: {
        cookie,
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      payload: { callbackURL: 'https://evil.example/steal' },
    });

    expect(response.statusCode).toBe(400);
  });
});
