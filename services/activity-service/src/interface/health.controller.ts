import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';

import type { ActivityRepositoryPort } from '../application/ports/activity.ports.js';
import type { ActivityEnv } from '../infrastructure/config/activity-env.js';
import { ACTIVITY_CONFIG, ACTIVITY_REPOSITORY } from './activity.tokens.js';

@Controller('health')
export class HealthController {
  public constructor(
    @Inject(ACTIVITY_CONFIG) private readonly config: ActivityEnv,
    @Inject(ACTIVITY_REPOSITORY) private readonly repository: ActivityRepositoryPort,
  ) {}

  @Get('live')
  public live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  public async ready(): Promise<{ status: 'ok'; activityDisabled?: true }> {
    try {
      await this.repository.ping();
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        checks: { database: false },
      });
    }

    if (!this.config.ACTIVITY_ENABLED) {
      return { status: 'ok', activityDisabled: true };
    }

    return { status: 'ok' };
  }
}
