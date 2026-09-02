import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { runMigrations } from './run-migrations.js';

const describeInfra = process.env.RUN_INFRA_TESTS === 'true' ? describe : describe.skip;
const connectionString =
  process.env.PLAYER_WORKSPACE_DATABASE_URL ??
  'postgresql://player_workspace:player_workspace_dev_password@127.0.0.1:5432/player_workspace';
const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../migrations',
);

describeInfra('player-workspace migrations', () => {
  const pool = new Pool({ connectionString });

  afterAll(async () => {
    await pool.end().catch(() => undefined);
  });

  it('applies foundation on fresh DB and is restart-safe NOOP', async () => {
    const first = await runMigrations({ connectionString, migrationsDir });
    expect(first.some((row) => row.id === '001_player_workspace_foundation.sql')).toBe(true);
    const second = await runMigrations({ connectionString, migrationsDir });
    expect(second.every((row) => row.status === 'skipped')).toBe(true);
  });

  it('detects checksum drift', async () => {
    await runMigrations({ connectionString, migrationsDir });
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE player_workspace_schema_migrations SET checksum = 'deadbeef' WHERE id = $1`,
        ['001_player_workspace_foundation.sql'],
      );
      await expect(runMigrations({ connectionString, migrationsDir })).rejects.toThrow(
        /checksum drift/,
      );
    } finally {
      await client.query(`DELETE FROM player_workspace_schema_migrations WHERE id = $1`, [
        '001_player_workspace_foundation.sql',
      ]);
      // re-apply cleanly for other tests
      await runMigrations({ connectionString, migrationsDir });
      client.release();
    }
  });
});
