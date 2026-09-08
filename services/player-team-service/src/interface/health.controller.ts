import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';

import { PlayerTeamStateRepository } from '../infrastructure/db/player-team-state.repository.js';

// Readiness must represent the schema required by the currently deployed binary,
// not merely the first historical migration. This keeps traffic away from a new
// Player Team instance until the Metin/General split schema is actually present.
const REQUIRED_MIGRATION_ID = '005_metin_general_hunts.sql';

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
    checks.migrations = await this.repository.isMigrationApplied(REQUIRED_MIGRATION_ID);

    if (checks.database && checks.migrations) {
      return { ok: true };
    }

    throw new ServiceUnavailableException({
      status: 'error',
      checks,
      requiredMigration: REQUIRED_MIGRATION_ID,
    });
  }
}
