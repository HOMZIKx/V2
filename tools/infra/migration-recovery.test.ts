import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const describeInfra = process.env.RUN_INFRA_TESTS === 'true' ? describe : describe.skip;

const adminUrl =
  process.env.V2_MIGRATION_ADMIN_DATABASE_URL ??
  'postgresql://v2_admin:v2_admin_dev_password@127.0.0.1:5432/postgres';

interface MigrationEntry {
  readonly id: string;
  readonly checksum: string;
  readonly status: 'applied' | 'skipped';
}

/**
 * Self-contained idempotent migration applier. Kept independent of service source
 * so shared-infra tests do not create cross-project dependency cycles.
 */
async function applyMigrations(
  connectionString: string,
  migrationsDir: string,
  trackingTable: string,
): Promise<MigrationEntry[]> {
  const pool = new Pool({ connectionString });
  const entries: MigrationEntry[] = [];
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${trackingTable} (
         id TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         checksum TEXT NOT NULL
       )`,
    );
    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort((left, right) => left.localeCompare(right));
    for (const file of files) {
      const contents = readFileSync(path.join(migrationsDir, file), 'utf8');
      const checksum = createHash('sha256')
        .update(contents.replace(/\r\n/g, '\n'), 'utf8')
        .digest('hex');
      const existing = await pool.query<{ checksum: string }>(
        `SELECT checksum FROM ${trackingTable} WHERE id = $1`,
        [file],
      );
      const recorded = existing.rows[0];
      if (recorded !== undefined) {
        if (recorded.checksum !== checksum) {
          throw new Error(
            `Migration ${file} checksum drift detected. Recorded ${recorded.checksum}, file is ${checksum}.`,
          );
        }
        entries.push({ id: file, checksum, status: 'skipped' });
        continue;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(contents);
        await client.query(`INSERT INTO ${trackingTable} (id, checksum) VALUES ($1, $2)`, [
          file,
          checksum,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      entries.push({ id: file, checksum, status: 'applied' });
    }
    return entries;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

type ServiceSpec = {
  readonly key: string;
  readonly ownerRole: string;
  readonly ownerPassword: string;
  readonly migrationsDir: string;
  readonly trackingTable: string;
  readonly verifySql: string;
};

const services: readonly ServiceSpec[] = [
  {
    key: 'identity',
    ownerRole: 'identity',
    ownerPassword: 'identity_dev_password',
    migrationsDir: path.join(repoRoot, 'services/identity-service/migrations'),
    trackingTable: 'identity_schema_migrations',
    verifySql: `SELECT to_regclass('public."user"') AS reg`,
  },
  {
    key: 'authorization',
    ownerRole: 'authorization',
    ownerPassword: 'authorization_dev_password',
    migrationsDir: path.join(repoRoot, 'services/authorization-service/migrations'),
    trackingTable: 'authorization_schema_migrations',
    verifySql: `SELECT to_regclass('public.organization') AS reg`,
  },
  {
    key: 'activity',
    ownerRole: 'activity',
    ownerPassword: 'activity_dev_password',
    migrationsDir: path.join(repoRoot, 'services/activity-service/migrations'),
    trackingTable: 'activity_schema_migrations',
    verifySql: `SELECT to_regclass('public.activities') AS reg`,
  },
];

async function createDisposableDatabase(
  admin: Client,
  dbName: string,
  owner: string,
): Promise<string> {
  await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(dbName)}`);
  await admin.query(`CREATE DATABASE ${quoteIdent(dbName)} OWNER ${quoteIdent(owner)}`);
  return `postgresql://${owner}:${services.find((s) => s.ownerRole === owner)?.ownerPassword}@127.0.0.1:5432/${dbName}`;
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

describeInfra('migration recovery drill (local Postgres)', () => {
  let admin: Client | undefined;
  let infraReady = false;
  const disposableNames: string[] = [];

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    try {
      await admin.connect();
      await admin.query('SELECT 1');
      infraReady = true;
    } catch (error) {
      console.warn(
        'Migration recovery infra tests skipped: Postgres unavailable.',
        error instanceof Error ? error.message : error,
      );
      infraReady = false;
    }
  }, 60_000);

  afterAll(async () => {
    if (admin !== undefined && infraReady) {
      for (const dbName of disposableNames) {
        await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(dbName)}`).catch(() => undefined);
      }
      await admin.end().catch(() => undefined);
    }
  });

  for (const service of services) {
    it(`fresh DB: applies all ${service.key} migrations`, async ({ skip }) => {
      if (!infraReady || admin === undefined) {
        skip();
        return;
      }
      const dbName = `v2_${service.key}_fresh_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
      disposableNames.push(dbName);
      const url = await createDisposableDatabase(admin, dbName, service.ownerRole);
      const first = await applyMigrations(url, service.migrationsDir, service.trackingTable);
      expect(first.some((row) => row.status === 'applied')).toBe(true);
      const client = new Client({ connectionString: url });
      await client.connect();
      try {
        const verify = await client.query<{ reg: string | null }>(service.verifySql);
        expect(verify.rows[0]?.reg).not.toBeNull();
        const count = await client.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM ${service.trackingTable}`,
        );
        const manifest = JSON.parse(
          readFileSync(path.join(service.migrationsDir, 'manifest.json'), 'utf8'),
        ) as { count: number };
        expect(Number(count.rows[0]?.n ?? '0')).toBe(manifest.count);
      } finally {
        await client.end().catch(() => undefined);
      }
    });

    it(`${service.key}: second migrate run is idempotent`, async ({ skip }) => {
      if (!infraReady || admin === undefined) {
        skip();
        return;
      }
      const dbName = `v2_${service.key}_idem_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
      disposableNames.push(dbName);
      const url = await createDisposableDatabase(admin, dbName, service.ownerRole);
      await applyMigrations(url, service.migrationsDir, service.trackingTable);
      const second = await applyMigrations(url, service.migrationsDir, service.trackingTable);
      expect(second.every((row) => row.status === 'skipped')).toBe(true);
    });
  }

  it('activity restore drill: dump → drop → restore → verify markers', async ({ skip }) => {
    if (!infraReady || admin === undefined) {
      skip();
      return;
    }
    const dbName = `v2_activity_restore_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    disposableNames.push(dbName);
    const url = await createDisposableDatabase(admin, dbName, 'activity');
    const activity = services.find((entry) => entry.key === 'activity');
    if (activity === undefined) {
      skip();
      return;
    }
    await applyMigrations(url, activity.migrationsDir, activity.trackingTable);
    const pool = new Pool({ connectionString: url });
    await pool.query(
      `INSERT INTO guild_activity_settings (guild_id, org_id) VALUES ('restore-g1', 'restore-o1')`,
    );
    await pool.query(
      `INSERT INTO activities (
         id, guild_id, organization_id, name, description, start_at, status,
         enrollment_open, organizer_discord_user_id, scheduled_finish_at, opaque_id
       ) VALUES (
         gen_random_uuid(), 'restore-g1', 'restore-o1', 'Restore proof', '', now(), 'published',
         true, 'restore-user', now() + interval '2 hours', 'restoreopaque1'
       )`,
    );
    await pool.end();

    const dumpDir = mkdtempSync(path.join(os.tmpdir(), 'v2-restore-'));
    const dumpPath = path.join(dumpDir, 'activity.dump');
    try {
      execFileSync('pg_dump', ['-Fc', '--no-owner', '-f', dumpPath, url], {
        stdio: 'pipe',
        env: process.env,
      });

      await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(dbName)}`);
      await admin.query(`CREATE DATABASE ${quoteIdent(dbName)} OWNER ${quoteIdent('activity')}`);

      execFileSync('pg_restore', ['--no-owner', '--dbname', url, dumpPath], {
        stdio: 'pipe',
        env: process.env,
      });

      const restored = new Client({ connectionString: url });
      await restored.connect();
      try {
        const markers = await restored.query<{ n: string }>(
          'SELECT COUNT(*)::text AS n FROM activity_schema_migrations',
        );
        expect(Number(markers.rows[0]?.n ?? '0')).toBeGreaterThan(0);
        const activities = await restored.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM activities WHERE guild_id = 'restore-g1'`,
        );
        expect(Number(activities.rows[0]?.n ?? '0')).toBe(1);
      } finally {
        await restored.end().catch(() => undefined);
      }

      const remigrate = await applyMigrations(url, activity.migrationsDir, activity.trackingTable);
      expect(remigrate.every((row) => row.status === 'skipped')).toBe(true);
    } finally {
      rmSync(dumpDir, { recursive: true, force: true });
    }
  });
});
