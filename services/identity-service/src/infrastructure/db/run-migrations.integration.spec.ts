import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isSchemaMigrationReady } from './migration-readiness.js';
import { runMigrations } from './run-migrations.js';

const runInfra = process.env.RUN_INFRA_TESTS === 'true' ? describe : describe.skip;

const adminUrl =
  process.env.V2_MIGRATION_ADMIN_DATABASE_URL ??
  'postgresql://v2_admin:v2_admin_dev_password@127.0.0.1:5432/postgres';

const repoMigrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../migrations',
);

function sha256(contents: string): string {
  return createHash('sha256').update(contents.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

runInfra('Identity runMigrations deploy-safety matrix', () => {
  const dbName = `id_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  let ownerUrl = '';
  const tempDirs: string[] = [];

  beforeAll(async () => {
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(`CREATE ROLE ${dbName}_role LOGIN PASSWORD 'mig_test_pw'`);
      await admin.query(`CREATE DATABASE ${dbName} OWNER ${dbName}_role`);
    } finally {
      await admin.end().catch(() => undefined);
    }
    ownerUrl = `postgresql://${dbName}_role:mig_test_pw@127.0.0.1:5432/${dbName}`;
  }, 60_000);

  afterAll(async () => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await admin.query(`DROP ROLE IF EXISTS ${dbName}_role`);
    } finally {
      await admin.end().catch(() => undefined);
    }
  }, 60_000);

  it('A: fresh DB applies all migrations in order', async () => {
    const results = await runMigrations({
      connectionString: ownerUrl,
      migrationsDir: repoMigrationsDir,
    });
    expect(results.map((r) => r.id)).toEqual([
      '001_better_auth.sql',
      '002_player_profile_foundation.sql',
      '003_player_game_accounts.sql',
    ]);
    expect(results.every((r) => r.status === 'applied')).toBe(true);

    const client = new Client({ connectionString: ownerUrl });
    await client.connect();
    try {
      const rows = await client.query<{ id: string }>(
        'SELECT id FROM identity_schema_migrations ORDER BY id',
      );
      expect(rows.rows.map((r) => r.id)).toEqual([
        '001_better_auth.sql',
        '002_player_profile_foundation.sql',
        '003_player_game_accounts.sql',
      ]);
      const ready = await isSchemaMigrationReady({
        hasSchemaMigration: async (id) => {
          const found = await client.query(
            'SELECT 1 FROM identity_schema_migrations WHERE id = $1',
            [id],
          );
          return (found.rowCount ?? 0) > 0;
        },
        countSchemaMigrations: async () => {
          const count = await client.query<{ n: string }>(
            'SELECT COUNT(*)::text AS n FROM identity_schema_migrations',
          );
          return Number(count.rows[0]?.n ?? 0);
        },
      });
      expect(ready).toBe(true);
    } finally {
      await client.end().catch(() => undefined);
    }
  });

  it('C+E: current DB re-run is NOOP and restart-safe', async () => {
    const again = await runMigrations({
      connectionString: ownerUrl,
      migrationsDir: repoMigrationsDir,
    });
    expect(again.every((r) => r.status === 'skipped')).toBe(true);
    expect(again).toHaveLength(3);
  });

  it('B: DB stopped after 001+002 applies only remaining file (isolated)', async () => {
    const partialDb = `id_part_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(`CREATE ROLE ${partialDb}_role LOGIN PASSWORD 'mig_test_pw'`);
      await admin.query(`CREATE DATABASE ${partialDb} OWNER ${partialDb}_role`);
    } finally {
      await admin.end().catch(() => undefined);
    }
    const partialUrl = `postgresql://${partialDb}_role:mig_test_pw@127.0.0.1:5432/${partialDb}`;
    const staged = mkdtempSync(path.join(os.tmpdir(), 'id-mig-partial-'));
    tempDirs.push(staged);
    mkdirSync(staged, { recursive: true });

    for (const id of ['001_better_auth.sql', '002_player_profile_foundation.sql']) {
      writeFileSync(path.join(staged, id), readFileSync(path.join(repoMigrationsDir, id), 'utf8'));
    }
    const first = await runMigrations({ connectionString: partialUrl, migrationsDir: staged });
    expect(first.map((r) => r.status)).toEqual(['applied', 'applied']);

    writeFileSync(
      path.join(staged, '003_player_game_accounts.sql'),
      readFileSync(path.join(repoMigrationsDir, '003_player_game_accounts.sql'), 'utf8'),
    );
    const second = await runMigrations({ connectionString: partialUrl, migrationsDir: staged });
    expect(second.map((r) => ({ id: r.id, status: r.status }))).toEqual([
      { id: '001_better_auth.sql', status: 'skipped' },
      { id: '002_player_profile_foundation.sql', status: 'skipped' },
      { id: '003_player_game_accounts.sql', status: 'applied' },
    ]);

    const cleanup = new Client({ connectionString: adminUrl });
    await cleanup.connect();
    try {
      await cleanup.query(`DROP DATABASE IF EXISTS ${partialDb} WITH (FORCE)`);
      await cleanup.query(`DROP ROLE IF EXISTS ${partialDb}_role`);
    } finally {
      await cleanup.end().catch(() => undefined);
    }
  });

  it('D: migration SQL failure fails closed (transaction rolled back)', async () => {
    const failDir = mkdtempSync(path.join(os.tmpdir(), 'id-mig-fail-'));
    tempDirs.push(failDir);
    writeFileSync(path.join(failDir, '001_ok.sql'), 'SELECT 1;');
    writeFileSync(path.join(failDir, '002_bad.sql'), 'SELECT * FROM definitely_missing_table_xyz;');

    const failDb = `id_fail_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(`CREATE ROLE ${failDb}_role LOGIN PASSWORD 'mig_test_pw'`);
      await admin.query(`CREATE DATABASE ${failDb} OWNER ${failDb}_role`);
    } finally {
      await admin.end().catch(() => undefined);
    }
    const failUrl = `postgresql://${failDb}_role:mig_test_pw@127.0.0.1:5432/${failDb}`;

    await expect(
      runMigrations({ connectionString: failUrl, migrationsDir: failDir }),
    ).rejects.toThrow();

    const client = new Client({ connectionString: failUrl });
    await client.connect();
    try {
      const rows = await client.query<{ id: string }>(
        'SELECT id FROM identity_schema_migrations ORDER BY id',
      );
      expect(rows.rows.map((r) => r.id)).toEqual(['001_ok.sql']);
    } finally {
      await client.end().catch(() => undefined);
    }

    const cleanup = new Client({ connectionString: adminUrl });
    await cleanup.connect();
    try {
      await cleanup.query(`DROP DATABASE IF EXISTS ${failDb} WITH (FORCE)`);
      await cleanup.query(`DROP ROLE IF EXISTS ${failDb}_role`);
    } finally {
      await cleanup.end().catch(() => undefined);
    }
  });

  it('F: inventory checksum mismatch fails closed', async () => {
    const driftDir = mkdtempSync(path.join(os.tmpdir(), 'id-mig-drift-'));
    tempDirs.push(driftDir);
    writeFileSync(path.join(driftDir, '001_ok.sql'), 'SELECT 1;');

    const driftDb = `id_drift_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(`CREATE ROLE ${driftDb}_role LOGIN PASSWORD 'mig_test_pw'`);
      await admin.query(`CREATE DATABASE ${driftDb} OWNER ${driftDb}_role`);
    } finally {
      await admin.end().catch(() => undefined);
    }
    const driftUrl = `postgresql://${driftDb}_role:mig_test_pw@127.0.0.1:5432/${driftDb}`;
    await runMigrations({ connectionString: driftUrl, migrationsDir: driftDir });

    writeFileSync(path.join(driftDir, '001_ok.sql'), 'SELECT 2;');
    await expect(
      runMigrations({ connectionString: driftUrl, migrationsDir: driftDir }),
    ).rejects.toThrow(/checksum drift/);

    const cleanup = new Client({ connectionString: adminUrl });
    await cleanup.connect();
    try {
      await cleanup.query(`DROP DATABASE IF EXISTS ${driftDb} WITH (FORCE)`);
      await cleanup.query(`DROP ROLE IF EXISTS ${driftDb}_role`);
    } finally {
      await cleanup.end().catch(() => undefined);
    }
  });

  it('G: concurrent invocations do not double-apply', async () => {
    const concDb = `id_conc_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(`CREATE ROLE ${concDb}_role LOGIN PASSWORD 'mig_test_pw'`);
      await admin.query(`CREATE DATABASE ${concDb} OWNER ${concDb}_role`);
    } finally {
      await admin.end().catch(() => undefined);
    }
    const concUrl = `postgresql://${concDb}_role:mig_test_pw@127.0.0.1:5432/${concDb}`;

    const [a, b] = await Promise.all([
      runMigrations({ connectionString: concUrl, migrationsDir: repoMigrationsDir }),
      runMigrations({ connectionString: concUrl, migrationsDir: repoMigrationsDir }),
    ]);

    const appliedA = a.filter((r) => r.status === 'applied').length;
    const appliedB = b.filter((r) => r.status === 'applied').length;
    expect(appliedA + appliedB).toBe(3);

    const client = new Client({ connectionString: concUrl });
    await client.connect();
    try {
      const count = await client.query<{ n: string }>(
        'SELECT COUNT(*)::text AS n FROM identity_schema_migrations',
      );
      expect(Number(count.rows[0]?.n)).toBe(3);
      const checksum = sha256(
        readFileSync(path.join(repoMigrationsDir, '003_player_game_accounts.sql'), 'utf8'),
      );
      const row = await client.query<{ checksum: string }>(
        `SELECT checksum FROM identity_schema_migrations WHERE id = '003_player_game_accounts.sql'`,
      );
      expect(row.rows[0]?.checksum).toBe(checksum);
    } finally {
      await client.end().catch(() => undefined);
    }

    const cleanup = new Client({ connectionString: adminUrl });
    await cleanup.connect();
    try {
      await cleanup.query(`DROP DATABASE IF EXISTS ${concDb} WITH (FORCE)`);
      await cleanup.query(`DROP ROLE IF EXISTS ${concDb}_role`);
    } finally {
      await cleanup.end().catch(() => undefined);
    }
  });
});
