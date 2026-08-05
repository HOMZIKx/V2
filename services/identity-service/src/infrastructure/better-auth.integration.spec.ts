import { APIError } from 'better-auth';
import { makeSignature } from 'better-auth/crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isSyntheticEmail } from '../domain/synthetic-email.js';
import { BetterAuthIdentityAdapter } from './adapters/better-auth-identity.adapter.js';
import {
  type AuthRuntime,
  createBetterAuth,
  mapDiscordProfileToUser,
} from './auth/create-better-auth.js';
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
  });
}

async function sessionHeaders(runtime: AuthRuntime, userId: string): Promise<Headers> {
  const context = await runtime.auth.$context;
  const session = await context.internalAdapter.createSession(userId);
  const signature = await makeSignature(session.token, context.secret);
  const headers = new Headers();
  headers.set('cookie', `${context.authCookies.sessionToken.name}=${session.token}.${signature}`);
  return headers;
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
});

runInfra('Better Auth linking / identity policies (no external OAuth)', () => {
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

  it('persists Discord email=null through the real mapper into a synthetic email user', async () => {
    const context = await runtime.auth.$context;
    const accountId = `discord-null-${Date.now()}`;
    const mapped = mapDiscordProfileToUser({
      id: accountId,
      username: 'NoEmail',
      email: null,
    });

    expect(isSyntheticEmail(mapped.email)).toBe(true);
    expect(mapped.emailVerified).toBe(false);

    const { user, account } = await context.internalAdapter.createOAuthUser(
      {
        name: mapped.name,
        email: mapped.email,
        emailVerified: mapped.emailVerified,
      },
      { providerId: 'discord', accountId },
    );
    createdUserIds.push(user.id);

    expect(user.email).toBe(mapped.email);
    expect(isSyntheticEmail(user.email)).toBe(true);
    expect(account.providerId).toBe('discord');
    expect(account.accountId).toBe(accountId);

    const headers = await sessionHeaders(runtime, user.id);
    const adapter = new BetterAuthIdentityAdapter(runtime.auth);
    const me = await adapter.getMe(headers);
    expect(me).toMatchObject({ id: user.id, email: null, emailSynthetic: true });
  });

  it('does not implicitly link when the same email collides across identities', async () => {
    const context = await runtime.auth.$context;
    const sharedEmail = `same-email-${Date.now()}@example.com`;

    const discord = await context.internalAdapter.createOAuthUser(
      { name: 'Discord Same', email: sharedEmail, emailVerified: false },
      { providerId: 'discord', accountId: `discord-same-${Date.now()}` },
    );
    createdUserIds.push(discord.user.id);

    // Unique email at the DB layer: a second OAuth identity with the same email
    // must not silently attach to the first user (implicit linking disabled).
    // Uses a deferred provider id string to prove Account/user policy without
    // activating a second OAuth socialProviders entry.
    await expect(
      context.internalAdapter.createOAuthUser(
        { name: 'Deferred Same', email: sharedEmail, emailVerified: true },
        { providerId: 'deferred', accountId: `deferred-same-${Date.now()}` },
      ),
    ).rejects.toBeTruthy();

    const headers = await sessionHeaders(runtime, discord.user.id);
    const adapter = new BetterAuthIdentityAdapter(runtime.auth);
    const accounts = await adapter.listAccounts(headers);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.provider).toBe('discord');
  });

  it('allows explicit link of a second provider account row with a different email on the same user', async () => {
    const context = await runtime.auth.$context;
    const stamp = Date.now();
    const { user } = await context.internalAdapter.createOAuthUser(
      {
        name: 'Explicit Link',
        email: `explicit-a-${stamp}@example.com`,
        emailVerified: false,
      },
      { providerId: 'discord', accountId: `discord-explicit-${stamp}` },
    );
    createdUserIds.push(user.id);

    // Architecture proof: Account supports multiple providers per V2 user.
    // Active OAuth remains Discord-only; `deferred` is not a socialProviders entry.
    await context.internalAdapter.linkAccount({
      userId: user.id,
      providerId: 'deferred',
      accountId: `deferred-explicit-${stamp}`,
      scope: 'openid email profile',
    });

    const headers = await sessionHeaders(runtime, user.id);
    const adapter = new BetterAuthIdentityAdapter(runtime.auth);
    const accounts = await adapter.listAccounts(headers);
    expect(accounts.map((account) => account.provider).sort()).toEqual(['deferred', 'discord']);
  });

  it('rejects an occupied provider subject (unique providerId+accountId)', async () => {
    const context = await runtime.auth.$context;
    const stamp = Date.now();
    const subject = `occupied-subject-${stamp}`;

    const first = await context.internalAdapter.createOAuthUser(
      {
        name: 'Owner',
        email: `owner-${stamp}@example.com`,
        emailVerified: false,
      },
      { providerId: 'discord', accountId: subject },
    );
    const second = await context.internalAdapter.createUser({
      name: 'Other',
      email: `other-${stamp}@example.com`,
    });
    createdUserIds.push(first.user.id, second.id);

    await expect(
      context.internalAdapter.linkAccount({
        userId: second.id,
        providerId: 'discord',
        accountId: subject,
      }),
    ).rejects.toBeTruthy();
  });

  it('refuses to unlink the last remaining account', async () => {
    const context = await runtime.auth.$context;
    const stamp = Date.now();
    const { user, account } = await context.internalAdapter.createOAuthUser(
      {
        name: 'Last Account',
        email: `last-${stamp}@example.com`,
        emailVerified: false,
      },
      { providerId: 'discord', accountId: `discord-last-${stamp}` },
    );
    createdUserIds.push(user.id);

    const headers = await sessionHeaders(runtime, user.id);

    await expect(
      runtime.auth.api.unlinkAccount({
        body: { providerId: account.providerId, accountId: account.accountId },
        headers,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof APIError)) {
        return false;
      }
      return error.body?.code === 'FAILED_TO_UNLINK_LAST_ACCOUNT';
    });

    const adapter = new BetterAuthIdentityAdapter(runtime.auth);
    await expect(adapter.unlinkAccount(account.id, headers)).rejects.toMatchObject({
      code: 'CANNOT_UNLINK_LAST',
    });
  });

  it('logoutCurrent clears cookies via returnHeaders and revokes the Redis session', async () => {
    const context = await runtime.auth.$context;
    const email = `logout-cookie-${Date.now()}@example.com`;
    const user = await context.internalAdapter.createUser({ name: 'Logout Cookie', email });
    createdUserIds.push(user.id);

    const session = await context.internalAdapter.createSession(user.id);
    const signature = await makeSignature(session.token, context.secret);
    const headers = new Headers();
    headers.set('cookie', `${context.authCookies.sessionToken.name}=${session.token}.${signature}`);

    const adapter = new BetterAuthIdentityAdapter(runtime.auth);
    const result = await adapter.logoutCurrent(headers);
    expect(result.setCookieHeaders.length).toBeGreaterThan(0);
    expect(
      result.setCookieHeaders.some((entry) => /max-age=0/i.test(entry) || /expires=/i.test(entry)),
    ).toBe(true);

    const after = await context.internalAdapter.findSession(session.token);
    expect(after).toBeNull();
  });
});
