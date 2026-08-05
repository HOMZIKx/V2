import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from '../../services/identity-service/src/infrastructure/db/run-migrations.js';

const runInfra = process.env.RUN_INFRA_TESTS === 'true' ? describe : describe.skip;

const databaseUrl =
  process.env.IDENTITY_DATABASE_URL ??
  'postgresql://identity:identity_dev_password@127.0.0.1:5432/identity';
const redisUrl = process.env.IDENTITY_REDIS_URL ?? 'redis://127.0.0.1:6379/1';
const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../services/identity-service/migrations',
);

/**
 * Minimal RESP client so the shared infra job can prove a Redis session-key
 * roundtrip without adding an ioredis dependency at the repo root.
 */
async function withRedis<T>(
  callback: (send: (...args: string[]) => Promise<string | number | null>) => Promise<T>,
): Promise<T> {
  const url = new URL(redisUrl);
  const db = url.pathname.replace('/', '') || '0';
  const socket = net.createConnection({
    host: url.hostname,
    port: Number(url.port) || 6379,
  });
  let buffer = Buffer.alloc(0);
  const waiters: ((value: string | number | null) => void)[] = [];

  const tryParse = (): void => {
    while (waiters.length > 0) {
      const newlineIndex = buffer.indexOf('\r\n');
      if (newlineIndex === -1) {
        return;
      }
      const type = String.fromCharCode(buffer[0] ?? 0);
      const line = buffer.subarray(1, newlineIndex).toString('utf8');

      if (type === '+' || type === ':' || type === '-') {
        buffer = buffer.subarray(newlineIndex + 2);
        const resolve = waiters.shift();
        resolve?.(type === ':' ? Number(line) : line);
        continue;
      }
      if (type === '$') {
        const length = Number(line);
        if (length === -1) {
          buffer = buffer.subarray(newlineIndex + 2);
          waiters.shift()?.(null);
          continue;
        }
        const start = newlineIndex + 2;
        const end = start + length;
        if (buffer.length < end + 2) {
          return;
        }
        const value = buffer.subarray(start, end).toString('utf8');
        buffer = buffer.subarray(end + 2);
        waiters.shift()?.(value);
        continue;
      }
      return;
    }
  };

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    tryParse();
  });

  const send = (...args: string[]): Promise<string | number | null> =>
    new Promise((resolve) => {
      waiters.push(resolve);
      const parts = [`*${args.length}\r\n`];
      for (const arg of args) {
        parts.push(`$${Buffer.byteLength(arg)}\r\n${arg}\r\n`);
      }
      socket.write(parts.join(''));
      tryParse();
    });

  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('error', reject);
  });

  try {
    await send('SELECT', db);
    return await callback(send);
  } finally {
    socket.end();
  }
}

runInfra('identity auth infrastructure', () => {
  beforeAll(async () => {
    await runMigrations({ connectionString: databaseUrl, migrationsDir });
  });

  afterAll(async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query("DELETE FROM \"user\" WHERE email LIKE 'infra-test-%'");
    } finally {
      await client.end().catch(() => undefined);
    }
  });

  it('records the 001 migration checksum and is idempotent', async () => {
    const results = await runMigrations({ connectionString: databaseUrl, migrationsDir });
    const entry = results.find((r) => r.id === '001_better_auth.sql');
    expect(entry).toBeDefined();
    expect(entry?.status).toBe('skipped');
    expect(entry?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('creates user + account rows and enforces (providerId, accountId) uniqueness', async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const userId = `infra-user-${Date.now()}`;
      const email = `infra-test-${Date.now()}@example.com`;
      await client.query(
        'INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)',
        [userId, 'Infra Test', email],
      );
      await client.query(
        'INSERT INTO "account" (id, "accountId", "providerId", "userId") VALUES ($1, $2, $3, $4)',
        [`infra-acc-${Date.now()}`, 'provider-account-1', 'discord', userId],
      );

      await expect(
        client.query(
          'INSERT INTO "account" (id, "accountId", "providerId", "userId") VALUES ($1, $2, $3, $4)',
          [`infra-acc-dup-${Date.now()}`, 'provider-account-1', 'discord', userId],
        ),
      ).rejects.toThrow();
    } finally {
      await client.end().catch(() => undefined);
    }
  });

  it('roundtrips a session key in Redis', async () => {
    await withRedis(async (send) => {
      const key = `v2:identity:auth:infra-test-${Date.now()}`;
      await send('SET', key, 'session-value', 'EX', '30');
      const value = await send('GET', key);
      expect(value).toBe('session-value');
      const deleted = await send('DEL', key);
      expect(deleted).toBe(1);
    });
  });
});
