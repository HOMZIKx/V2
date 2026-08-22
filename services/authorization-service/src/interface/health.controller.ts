import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { readRuntimeRevision } from '@v2/configuration';

import type { AuthorizationStorePort } from '../application/ports/authorization.ports.js';
import type { AuthorizationEnv } from '../infrastructure/config/authorization-env.js';
import { pingRedis } from '../infrastructure/redis/ping-redis.js';
import { AUTHORIZATION_CONFIG, AUTHORIZATION_STORE_PORT } from './authorization.tokens.js';

const MIGRATION_ID = '001_authorization_foundation.sql';

@Controller('health')
export class HealthController {
  public constructor(
    @Inject(AUTHORIZATION_CONFIG) private readonly config: AuthorizationEnv,
    @Inject(AUTHORIZATION_STORE_PORT) private readonly store: AuthorizationStorePort,
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
  public async ready(): Promise<{
    status: 'ok';
    authorizationDisabled?: true;
    checks?: {
      database: boolean;
      migrations: boolean;
      redis: boolean | 'not_configured';
    };
  }> {
    if (!this.config.AUTHORIZATION_ENABLED) {
      return { status: 'ok', authorizationDisabled: true };
    }

    const checks: {
      database: boolean;
      migrations: boolean;
      redis: boolean | 'not_configured';
    } = {
      database: false,
      migrations: false,
      redis: this.config.AUTHORIZATION_ASSERTION_REDIS_URL === undefined ? 'not_configured' : false,
    };

    try {
      await this.store.ping();
      checks.database = true;
    } catch {
      checks.database = false;
    }

    try {
      checks.migrations = await this.store.hasSchemaMigration(MIGRATION_ID);
    } catch {
      checks.migrations = false;
    }

    if (this.config.AUTHORIZATION_ASSERTION_REDIS_URL !== undefined) {
      try {
        await pingRedis(this.config.AUTHORIZATION_ASSERTION_REDIS_URL);
        checks.redis = true;
      } catch {
        checks.redis = false;
      }
    }

    const redisOk = checks.redis === 'not_configured' || checks.redis === true;
    if (checks.database && checks.migrations && redisOk) {
      return { status: 'ok', checks };
    }

    throw new ServiceUnavailableException({ status: 'error', checks });
  }
}
