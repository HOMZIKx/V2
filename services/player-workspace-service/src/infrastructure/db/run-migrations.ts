import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

export interface MigrationResult {
  readonly id: string;
  readonly checksum: string;
  readonly status: 'applied' | 'skipped';
}

interface RunMigrationsOptions {
  readonly connectionString: string;
  readonly migrationsDir: string;
}

const TRACKING_TABLE = 'player_workspace_schema_migrations';
const ADVISORY_LOCK_CLASS = 872_014;
const ADVISORY_LOCK_ID = 4;

function sha256(contents: string): string {
  const normalized = contents.replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function listMigrationFiles(migrationsDir: string): string[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Idempotent SQL migration runner for Player Workspace.
 * Concurrent callers are serialized with `pg_advisory_lock`.
 */
export async function runMigrations(options: RunMigrationsOptions): Promise<MigrationResult[]> {
  const pool = new Pool({ connectionString: options.connectionString });
  const results: MigrationResult[] = [];
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [ADVISORY_LOCK_CLASS, ADVISORY_LOCK_ID]);
    try {
      await client.query(
        `CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
           id TEXT PRIMARY KEY,
           applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
           checksum TEXT NOT NULL
         )`,
      );

      for (const file of listMigrationFiles(options.migrationsDir)) {
        const contents = readFileSync(path.join(options.migrationsDir, file), 'utf8');
        const checksum = sha256(contents);

        const existing = await client.query<{ checksum: string }>(
          `SELECT checksum FROM ${TRACKING_TABLE} WHERE id = $1`,
          [file],
        );

        const recorded = existing.rows[0];
        if (recorded !== undefined) {
          if (recorded.checksum !== checksum) {
            throw new Error(
              `Migration ${file} checksum drift detected. Recorded ${recorded.checksum}, file is ${checksum}. Migrations are immutable once applied.`,
            );
          }
          results.push({ id: file, checksum, status: 'skipped' });
          continue;
        }

        try {
          await client.query('BEGIN');
          await client.query(contents);
          await client.query(`INSERT INTO ${TRACKING_TABLE} (id, checksum) VALUES ($1, $2)`, [
            file,
            checksum,
          ]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw error;
        }

        results.push({ id: file, checksum, status: 'applied' });
      }

      return results;
    } finally {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [
        ADVISORY_LOCK_CLASS,
        ADVISORY_LOCK_ID,
      ]);
    }
  } finally {
    client.release();
    await pool.end().catch(() => undefined);
  }
}
