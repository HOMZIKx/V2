import { Module, type Provider } from '@nestjs/common';

import { BetterAuthIdentityAdapter } from '../infrastructure/adapters/better-auth-identity.adapter.js';
import {
  createInternalJwtAdapter,
  InternalJwtAdapter,
} from '../infrastructure/adapters/internal-jwt.adapter.js';
import { type AuthRuntime, createBetterAuth } from '../infrastructure/auth/create-better-auth.js';
import { type IdentityEnv, parseIdentityEnv } from '../infrastructure/config/identity-env.js';
import { createAssertionJtiStore } from '../infrastructure/internal-jwt/assertion-jti-store.js';
import { createInternalJwtRuntime } from '../infrastructure/internal-jwt/create-internal-jwt-runtime.js';
import { AuthBootstrapService } from './auth-bootstrap.service.js';
import { HealthController } from './health.controller.js';
import { IdentityController } from './identity.controller.js';
import {
  AUTH_RUNTIME,
  CLIENT_ASSERTION_PORT,
  IDENTITY_CONFIG,
  IDENTITY_SESSION_PORT,
  INTERNAL_JWT_ISSUE_PORT,
  INTERNAL_JWT_RUNTIME,
} from './identity.tokens.js';
import { InternalJwtLifecycleService } from './internal-jwt-lifecycle.service.js';
import { InternalTokenController } from './internal-token.controller.js';
import { ProofUiController } from './proof-ui.controller.js';
import { SystemRevokeController } from './system-revoke.controller.js';

const providers: Provider[] = [
  {
    provide: IDENTITY_CONFIG,
    useFactory: (): IdentityEnv => parseIdentityEnv(process.env),
  },
  {
    provide: AUTH_RUNTIME,
    useFactory: (config: IdentityEnv): AuthRuntime | null =>
      config.IDENTITY_AUTH_ENABLED ? createBetterAuth(config) : null,
    inject: [IDENTITY_CONFIG],
  },
  {
    provide: IDENTITY_SESSION_PORT,
    useFactory: (runtime: AuthRuntime | null): BetterAuthIdentityAdapter | null =>
      runtime === null ? null : new BetterAuthIdentityAdapter(runtime.auth),
    inject: [AUTH_RUNTIME],
  },
  {
    provide: INTERNAL_JWT_RUNTIME,
    useFactory: async (config: IdentityEnv) => {
      if (!config.IDENTITY_INTERNAL_JWT_ENABLED) {
        return null;
      }
      const assertionJtiStore = createAssertionJtiStore(
        config.IDENTITY_REDIS_URL,
        config.IDENTITY_CLIENT_ASSERTION_REDIS_PREFIX,
      );
      return createInternalJwtRuntime(config, assertionJtiStore);
    },
    inject: [IDENTITY_CONFIG],
  },
  {
    provide: InternalJwtAdapter,
    useFactory: (
      config: IdentityEnv,
      runtime: Awaited<ReturnType<typeof createInternalJwtRuntime>> | null,
    ) => (runtime === null ? null : createInternalJwtAdapter(runtime, config)),
    inject: [IDENTITY_CONFIG, INTERNAL_JWT_RUNTIME],
  },
  {
    provide: CLIENT_ASSERTION_PORT,
    useExisting: InternalJwtAdapter,
  },
  {
    provide: INTERNAL_JWT_ISSUE_PORT,
    useExisting: InternalJwtAdapter,
  },
  AuthBootstrapService,
  InternalJwtLifecycleService,
];

@Module({
  controllers: [
    HealthController,
    IdentityController,
    InternalTokenController,
    SystemRevokeController,
    ProofUiController,
  ],
  providers,
})
export class AppModule {}
