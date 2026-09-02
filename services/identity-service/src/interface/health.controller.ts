import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { readRuntimeRevision } from '@v2/configuration';

import type { AuthRuntime } from '../infrastructure/auth/create-better-auth.js';
import type { IdentityEnv } from '../infrastructure/config/identity-env.js';
import { isSchemaMigrationReady } from '../infrastructure/db/migration-readiness.js';
import { AUTH_RUNTIME, IDENTITY_CONFIG } from './identity.tokens.js';

@Controller('health')
export class HealthController {
  public constructor(
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityEnv,
    @Inject(AUTH_RUNTIME) private readonly runtime: AuthRuntime | null,
  ) {}

  @Get('live')
  public live(): { status: 'ok'; gitCommitSha: string; appVersion: string } {
    return { status: 'ok', ...readRuntimeRevision() };
  }

  @Get('version')
  public version(): { status: 'ok'; gitCommitSha: string; appVersion: string } {
    return this.live();
  }

  @Get('ready')
  public async ready(): Promise<{ status: 'ok'; authDisabled?: true }> {
    if (!this.config.IDENTITY_AUTH_ENABLED || this.runtime === null) {
      return { status: 'ok', authDisabled: true };
    }

    const checks: Record<string, boolean> = {
      database: false,
      redis: false,
      migrations: false,
    };

    try {
      await this.runtime.pool.query('SELECT 1');
      checks.database = true;
    } catch {
      checks.database = false;
    }

    try {
      const pong = await this.runtime.redis.ping();
      checks.redis = pong === 'PONG';
    } catch {
      checks.redis = false;
    }

    try {
      checks.migrations = await isSchemaMigrationReady({
        hasSchemaMigration: async (migrationId) => {
          const result = await this.runtime!.pool.query<{ id: string }>(
            'SELECT id FROM identity_schema_migrations WHERE id = $1',
            [migrationId],
          );
          return result.rowCount !== null && result.rowCount > 0;
        },
        countSchemaMigrations: async () => {
          const result = await this.runtime!.pool.query<{ n: string }>(
            'SELECT COUNT(*)::text AS n FROM identity_schema_migrations',
          );
          return Number(result.rows[0]?.n ?? '0');
        },
      });
    } catch {
      checks.migrations = false;
    }

    if (checks.database && checks.redis && checks.migrations) {
      return { status: 'ok' };
    }

    // 503 with per-dependency booleans only — never connection strings.
    throw new ServiceUnavailableException({ status: 'error', checks });
  }
}
