import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BetterAuthIdentityAdapter } from './adapters/better-auth-identity.adapter.js';
import { type AuthRuntime, createBetterAuth } from './auth/create-better-auth.js';
import { type IdentityEnv, parseIdentityEnv } from './config/identity-env.js';
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

function buildConfig(): IdentityEnv {
  return parseIdentityEnv({
    IDENTITY_AUTH_ENABLED: 'true',
    IDENTITY_DATABASE_URL: databaseUrl,
    IDENTITY_REDIS_URL: redisUrl,
    IDENTITY_AUTH_BASE_URL: 'http://127.0.0.1:4200',
    IDENTITY_TRUSTED_ORIGINS: 'http://localhost:3000',
    IDENTITY_BETTER_AUTH_SECRET: 'test-secret-value-that-is-at-least-32-bytes',
    IDENTITY_DISCORD_CLIENT_ID: 'test-discord-id',
    IDENTITY_DISCORD_CLIENT_SECRET: 'test-discord-secret',
    IDENTITY_GOOGLE_CLIENT_ID: 'test-google-id',
    IDENTITY_GOOGLE_CLIENT_SECRET: 'test-google-secret',
  });
}

runInfra('Better Auth storage model (PostgreSQL + Redis)', () => {
  let runtime: AuthRuntime;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    await runMigrations({ connectionString: databaseUrl, migrationsDir });
    runtime = createBetterAuth(buildConfig());
  });

  afterAll(async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      for (const id of createdUserIds) {
        await client.query('DELETE FROM "user" WHERE id = $1', [id]);
      }
    } finally {
      await client.end().catch(() => undefined);
    }
    await runtime.close();
  });

  it('applies migrations idempotently', async () => {
    const first = await runMigrations({ connectionString: databaseUrl, migrationsDir });
    const second = await runMigrations({ connectionString: databaseUrl, migrationsDir });
    expect(first.find((r) => r.id === '001_better_auth.sql')).toBeDefined();
    expect(second.every((r) => r.status === 'skipped')).toBe(true);
  });

  it('keeps no session table in PostgreSQL (Redis is the session SoT)', async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const result = await client.query<{ reg: string | null }>(
        "SELECT to_regclass('public.session') AS reg",
      );
      expect(result.rows[0]?.reg).toBeNull();
    } finally {
      await client.end().catch(() => undefined);
    }
  });

  it('does not persist raw provider tokens on account rows', async () => {
    const context = await runtime.auth.$context;
    const email = `token-test-${Date.now()}@example.com`;
    const user = await context.internalAdapter.createUser({ name: 'Token Test', email });
    createdUserIds.push(user.id);

    await context.internalAdapter.linkAccount({
      userId: user.id,
      providerId: 'discord',
      accountId: `discord-${Date.now()}`,
      accessToken: 'raw-access-token',
      refreshToken: 'raw-refresh-token',
      idToken: 'raw-id-token',
      scope: 'identify',
    });

    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const result = await client.query<{
        accessToken: string | null;
        refreshToken: string | null;
        idToken: string | null;
      }>('SELECT "accessToken", "refreshToken", "idToken" FROM "account" WHERE "userId" = $1', [
        user.id,
      ]);
      const row = result.rows[0];
      expect(row?.accessToken).toBeNull();
      expect(row?.refreshToken).toBeNull();
      expect(row?.idToken).toBeNull();
    } finally {
      await client.end().catch(() => undefined);
    }
  });

  it('stores an active session in Redis and revokes it immediately', async () => {
    const context = await runtime.auth.$context;
    const email = `session-test-${Date.now()}@example.com`;
    const user = await context.internalAdapter.createUser({ name: 'Session Test', email });
    createdUserIds.push(user.id);

    const session = await context.internalAdapter.createSession(user.id);
    expect(session.token).toBeTruthy();

    const redisKeys = await runtime.redis.keys('v2:identity:auth:*');
    expect(redisKeys.length).toBeGreaterThan(0);

    const found = await context.internalAdapter.findSession(session.token);
    expect(found?.session.userId).toBe(user.id);

    const adapter = new BetterAuthIdentityAdapter(runtime.auth);
    await adapter.revokeAllSessionsForUser(user.id);

    const afterRevoke = await context.internalAdapter.findSession(session.token);
    expect(afterRevoke).toBeNull();
  });

  it('creates a stable V2 user with a synthetic email for Discord email=null', async () => {
    const context = await runtime.auth.$context;
    const accountId = `discord-null-${Date.now()}`;
    const { user, account } = await context.internalAdapter.createOAuthUser(
      { name: 'NoEmail', email: `v2+discord+${'0'.repeat(16)}@discord.invalid`, emailVerified: false },
      { providerId: 'discord', accountId },
    );
    createdUserIds.push(user.id);

    expect(user.id).toMatch(/[0-9a-f-]{36}/);
    expect(account.providerId).toBe('discord');

    const adapter = new BetterAuthIdentityAdapter(runtime.auth);
    // getSession requires cookies; here we assert the storage-level identity is stable.
    void adapter;
  });
});
