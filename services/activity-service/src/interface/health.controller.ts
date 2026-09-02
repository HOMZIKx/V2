import { Controller, Get, Inject, Optional, ServiceUnavailableException } from '@nestjs/common';
import { readRuntimeRevision } from '@v2/configuration';

import type { ActivityRepositoryPort } from '../application/ports/activity.ports.js';
import type { ActivityEnv } from '../infrastructure/config/activity-env.js';
import { isSchemaMigrationReady } from '../infrastructure/db/migration-readiness.js';
import type { AssertionJtiStore } from '../infrastructure/internal/assertion-jti-store.js';
import { pingRedis } from '../infrastructure/redis/ping-redis.js';
import { ACTIVITY_CONFIG, ACTIVITY_REPOSITORY, ASSERTION_JTI_STORE } from './activity.tokens.js';

@Controller()
export class HealthController {
  public constructor(
    @Inject(ACTIVITY_CONFIG) private readonly config: ActivityEnv,
    @Inject(ACTIVITY_REPOSITORY) private readonly repository: ActivityRepositoryPort,
    @Optional()
    @Inject(ASSERTION_JTI_STORE)
    private readonly jtiStore: AssertionJtiStore | null = null,
  ) {}

  @Get('health/live')
  public live(): { status: 'ok'; gitCommitSha: string; appVersion: string } {
    return { status: 'ok', ...readRuntimeRevision() };
  }

  @Get('version')
  public version(): { status: 'ok'; gitCommitSha: string; appVersion: string } {
    return this.live();
  }

  @Get('health/ready')
  public async ready(): Promise<{
    status: 'ok';
    activityDisabled?: true;
    checks: { database: boolean; redis: boolean | 'not_configured'; migrations: boolean };
    outbox?: Awaited<ReturnType<NonNullable<ActivityRepositoryPort['countOutboxByStatus']>>>;
  }> {
    const checks: {
      database: boolean;
      redis: boolean | 'not_configured';
      migrations: boolean;
    } = {
      database: false,
      redis: this.config.ACTIVITY_REDIS_URL === undefined ? 'not_configured' : false,
      migrations: false,
    };

    try {
      await this.repository.ping();
      checks.database = true;
    } catch {
      checks.database = false;
    }

    try {
      checks.migrations = await isSchemaMigrationReady(this.repository);
    } catch {
      checks.migrations = false;
    }

    if (this.config.ACTIVITY_REDIS_URL !== undefined) {
      try {
        if (this.jtiStore !== null) {
          await this.jtiStore.ping();
        } else {
          await pingRedis(this.config.ACTIVITY_REDIS_URL);
        }
        checks.redis = true;
      } catch {
        checks.redis = false;
      }
    }

    const outbox =
      this.repository.countOutboxByStatus === undefined
        ? undefined
        : await this.repository.countOutboxByStatus().catch(() => undefined);

    const redisOk = checks.redis === 'not_configured' || checks.redis === true;
    if (!checks.database || !checks.migrations || !redisOk) {
      throw new ServiceUnavailableException({
        status: 'error',
        checks,
        ...(outbox !== undefined ? { outbox } : {}),
      });
    }

    if (!this.config.ACTIVITY_ENABLED) {
      return {
        status: 'ok',
        activityDisabled: true,
        checks,
        ...(outbox !== undefined ? { outbox } : {}),
      };
    }

    return { status: 'ok', checks, ...(outbox !== undefined ? { outbox } : {}) };
  }
}
