import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { Pool } from 'pg';

import { isSchemaMigrationReady } from '../infrastructure/db/migration-readiness.js';
import { PLAYER_WORKSPACE_POOL } from './player-workspace.tokens.js';

@Controller()
export class HealthController {
  public constructor(@Inject(PLAYER_WORKSPACE_POOL) private readonly pool: Pool) {}

  @Get('health/live')
  public live() {
    return { status: 'ok' as const };
  }

  @Get('health/ready')
  public async ready() {
    try {
      await this.pool.query('SELECT 1');
      const ready = await isSchemaMigrationReady({
        hasSchemaMigration: async (migrationId) => {
          const result = await this.pool.query(
            `SELECT 1 FROM player_workspace_schema_migrations WHERE id = $1`,
            [migrationId],
          );
          return (result.rowCount ?? 0) > 0;
        },
        countSchemaMigrations: async () => {
          const result = await this.pool.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM player_workspace_schema_migrations`,
          );
          return Number(result.rows[0]?.count ?? '0');
        },
      });
      if (!ready) {
        throw new ServiceUnavailableException({ status: 'not_ready', migrations: false });
      }
      return { status: 'ok' as const, migrations: true };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException({ status: 'not_ready', database: false });
    }
  }

  @Get('version')
  public version() {
    return {
      service: 'player-workspace-service',
      gitSha: process.env.V2_IMAGE_GIT_COMMIT_SHA ?? null,
    };
  }
}
