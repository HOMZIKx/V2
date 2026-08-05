import { Module, type Provider } from '@nestjs/common';

import { BetterAuthIdentityAdapter } from '../infrastructure/adapters/better-auth-identity.adapter.js';
import { type AuthRuntime, createBetterAuth } from '../infrastructure/auth/create-better-auth.js';
import { type IdentityEnv, parseIdentityEnv } from '../infrastructure/config/identity-env.js';
import { AuthBootstrapService } from './auth-bootstrap.service.js';
import { HealthController } from './health.controller.js';
import { IdentityController } from './identity.controller.js';
import { AUTH_RUNTIME, IDENTITY_CONFIG, IDENTITY_SESSION_PORT } from './identity.tokens.js';
import { ProofUiController } from './proof-ui.controller.js';

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
  AuthBootstrapService,
];

@Module({
  controllers: [HealthController, IdentityController, ProofUiController],
  providers,
})
export class AppModule {}
