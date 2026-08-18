import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { readRuntimeRevision } from '@v2/configuration';

import type { AuthorizationStorePort } from '../application/ports/authorization.ports.js';
import type { AuthorizationEnv } from '../infrastructure/config/authorization-env.js';
import { AUTHORIZATION_CONFIG, AUTHORIZATION_STORE_PORT } from './authorization.tokens.js';

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

  @Get('ready')
  public async ready(): Promise<{ status: 'ok'; authorizationDisabled?: true }> {
    if (!this.config.AUTHORIZATION_ENABLED) {
      return { status: 'ok', authorizationDisabled: true };
    }

    try {
      await this.store.ping();
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        checks: { database: false },
      });
    }

    return { status: 'ok' };
  }
}
