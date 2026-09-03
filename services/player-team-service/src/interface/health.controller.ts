import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';

import { PlayerTeamStateRepository } from '../infrastructure/db/player-team-state.repository.js';

const MIGRATION_ID = '001_initial_schema.sql';

@Controller('health')
export class HealthController {
  public constructor(
    @Inject(PlayerTeamStateRepository) private readonly repository: PlayerTeamStateRepository,
  ) {}

  @Get('live')
  public live(): { readonly ok: true } {
    return { ok: true };
  }

  @Get('ready')
  public async ready(): Promise<{ readonly ok: true }> {
    const checks: Record<string, boolean> = {
      database: false,
      migrations: false,
    };

    checks.database = await this.repository.pingDatabase();
    checks.migrations = await this.repository.isMigrationApplied(MIGRATION_ID);

    if (checks.database && checks.migrations) {
      return { ok: true };
    }

    throw new ServiceUnavailableException({ status: 'error', checks });
  }
}
