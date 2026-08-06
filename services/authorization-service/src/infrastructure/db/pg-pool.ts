import { Pool } from 'pg';

/**
 * Create a PostgreSQL pool for the Authorization Service database.
 * Callers own lifecycle (`end` on shutdown).
 */
export function createAuthorizationPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}
