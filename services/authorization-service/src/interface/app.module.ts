import { Module, type Provider } from '@nestjs/common';
import type { Pool } from 'pg';

import type {
  AuthorizationStorePort,
  SessionRevokePort,
} from '../application/ports/authorization.ports.js';
import { AuthorizationAdapter } from '../infrastructure/adapters/authorization.adapter.js';
import {
  type AuthorizationEnv,
  parseAuthorizationEnv,
} from '../infrastructure/config/authorization-env.js';
import { createAuthorizationPool } from '../infrastructure/db/pg-pool.js';
import { SystemRevokeClient } from '../infrastructure/identity/system-revoke-client.js';
import {
  type AssertionJtiStore,
  createAssertionJtiStore,
  type InboundClientRegistry,
  loadInboundClientRegistry,
} from '../infrastructure/internal/verify-inbound-assertion.js';
import { AuthorizationRepository } from '../infrastructure/persistence/authorization-repository.js';
import { AuthorizationBootstrapService } from './authorization-bootstrap.service.js';
import { AuthorizationController } from './authorization.controller.js';
import {
  ASSERTION_JTI_STORE,
  AUTHORIZATION_CONFIG,
  AUTHORIZATION_POOL,
  AUTHORIZATION_STORE_PORT,
  INBOUND_CLIENT_REGISTRY,
  SESSION_REVOKE_PORT,
} from './authorization.tokens.js';
import { HealthController } from './health.controller.js';
import { InboundAssertionGuard } from './inbound-assertion.guard.js';

const providers: Provider[] = [
  {
    provide: AUTHORIZATION_CONFIG,
    useFactory: (): AuthorizationEnv => parseAuthorizationEnv(process.env),
  },
  {
    provide: AUTHORIZATION_POOL,
    useFactory: (config: AuthorizationEnv): Pool =>
      createAuthorizationPool(config.AUTHORIZATION_DATABASE_URL),
    inject: [AUTHORIZATION_CONFIG],
  },
  {
    provide: AuthorizationRepository,
    useFactory: (pool: Pool, config: AuthorizationEnv): AuthorizationRepository =>
      new AuthorizationRepository(pool, config.AUTHORIZATION_TRUST_WINDOW_SECONDS),
    inject: [AUTHORIZATION_POOL, AUTHORIZATION_CONFIG],
  },
  {
    provide: AUTHORIZATION_STORE_PORT,
    useFactory: (repository: AuthorizationRepository): AuthorizationStorePort =>
      new AuthorizationAdapter(repository),
    inject: [AuthorizationRepository],
  },
  {
    provide: SESSION_REVOKE_PORT,
    useFactory: (config: AuthorizationEnv): SessionRevokePort | null =>
      SystemRevokeClient.fromEnv(config),
    inject: [AUTHORIZATION_CONFIG],
  },
  {
    provide: INBOUND_CLIENT_REGISTRY,
    useFactory: async (config: AuthorizationEnv): Promise<InboundClientRegistry | null> => {
      if (
        !config.AUTHORIZATION_ENABLED ||
        config.AUTHORIZATION_INBOUND_CLIENTS_JSON === undefined
      ) {
        return null;
      }
      return loadInboundClientRegistry(config.AUTHORIZATION_INBOUND_CLIENTS_JSON);
    },
    inject: [AUTHORIZATION_CONFIG],
  },
  {
    provide: ASSERTION_JTI_STORE,
    useFactory: (config: AuthorizationEnv): AssertionJtiStore | null => {
      if (
        !config.AUTHORIZATION_ENABLED ||
        config.AUTHORIZATION_ASSERTION_REDIS_URL === undefined
      ) {
        return null;
      }
      return createAssertionJtiStore(
        config.AUTHORIZATION_ASSERTION_REDIS_URL,
        config.AUTHORIZATION_ASSERTION_REDIS_PREFIX,
      );
    },
    inject: [AUTHORIZATION_CONFIG],
  },
  InboundAssertionGuard,
  AuthorizationBootstrapService,
];

@Module({
  controllers: [HealthController, AuthorizationController],
  providers,
})
export class AppModule {}
