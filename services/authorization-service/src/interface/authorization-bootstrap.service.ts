import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { Pool } from 'pg';

import type { AuthorizationStorePort } from '../application/ports/authorization.ports.js';
import type { AuthorizationEnv } from '../infrastructure/config/authorization-env.js';
import type { AssertionJtiStore } from '../infrastructure/internal/verify-inbound-assertion.js';
import {
  ASSERTION_JTI_STORE,
  AUTHORIZATION_CONFIG,
  AUTHORIZATION_POOL,
  AUTHORIZATION_STORE_PORT,
} from './authorization.tokens.js';

@Injectable()
export class AuthorizationBootstrapService implements OnModuleInit, OnModuleDestroy {
  public constructor(
    @Inject(AUTHORIZATION_CONFIG) private readonly config: AuthorizationEnv,
    @Inject(AUTHORIZATION_STORE_PORT) private readonly store: AuthorizationStorePort,
    @Inject(AUTHORIZATION_POOL) private readonly pool: Pool,
    @Inject(ASSERTION_JTI_STORE) private readonly jtiStore: AssertionJtiStore | null,
  ) {}

  public async onModuleInit(): Promise<void> {
    await this.store.ensureOrganization(this.config.AUTHORIZATION_ORGANIZATION_ID);
  }

  public async onModuleDestroy(): Promise<void> {
    await this.jtiStore?.close().catch(() => undefined);
    await this.pool.end().catch(() => undefined);
  }
}
