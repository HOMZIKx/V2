import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlayerWorkspaceEnvFiles } from '../src/infrastructure/config/load-env-file.js';
import { runMigrations } from '../src/infrastructure/db/run-migrations.js';

loadPlayerWorkspaceEnvFiles();

const connectionString = process.env.PLAYER_WORKSPACE_DATABASE_URL?.trim();
if (connectionString === undefined || connectionString.length === 0) {
  console.error('PLAYER_WORKSPACE_DATABASE_URL is required to run migrations.');
  process.exit(1);
}

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

const results = await runMigrations({ connectionString, migrationsDir });
for (const result of results) {
  console.log(`${result.status.padEnd(7)} ${result.id} sha256=${result.checksum}`);
}
