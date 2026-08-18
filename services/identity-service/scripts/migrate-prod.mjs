import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMigrations } from '../dist/services/identity-service/src/infrastructure/db/run-migrations.js';

const connectionString = process.env.IDENTITY_DATABASE_URL?.trim();
if (connectionString === undefined || connectionString.length === 0) {
  console.error('IDENTITY_DATABASE_URL is required to run migrations.');
  process.exit(1);
}

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

runMigrations({ connectionString, migrationsDir })
  .then((results) => {
    for (const result of results) {
      console.log(`${result.status.padEnd(7)} ${result.id} sha256=${result.checksum}`);
    }
    const appliedCount = results.filter((result) => result.status === 'applied').length;
    console.log(`Identity migrations complete. Applied ${appliedCount}, total ${results.length}.`);
  })
  .catch((error) => {
    console.error('Identity migration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
