import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadActivityEnvFiles } from '../src/infrastructure/config/load-env-file.js';
import { runMigrations } from '../src/infrastructure/db/run-migrations.js';

loadActivityEnvFiles();

const connectionString = process.env.ACTIVITY_DATABASE_URL;
if (connectionString === undefined || connectionString.trim() === '') {
  console.error('ACTIVITY_DATABASE_URL is required to run migrations.');
  process.exit(1);
}

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

runMigrations({ connectionString, migrationsDir })
  .then((results) => {
    for (const result of results) {
      console.log(`${result.status.padEnd(7)} ${result.id} sha256=${result.checksum}`);
    }
    const appliedCount = results.filter((result) => result.status === 'applied').length;
    console.log(`Activity migrations complete. Applied ${appliedCount}, total ${results.length}.`);
  })
  .catch((error: unknown) => {
    console.error(
      'Activity migration failed:',
      error instanceof Error ? error.message : 'unknown error',
    );
    process.exit(1);
  });
