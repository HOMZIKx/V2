import { Module, type Provider } from '@nestjs/common';

import { readActivityAssertionConfigFromEnv } from './activity-assertion.js';
import { ActivityProxyController } from './activity-proxy.controller.js';
import {
  ACTIVITY_ASSERTION_CONFIG,
  ACTIVITY_SERVICE_BASE_URL,
  API_GATEWAY_FORWARD_ACTOR_HEADERS,
  IDENTITY_SERVICE_BASE_URL,
  type ActivityAssertionConfig,
} from './activity-proxy.tokens.js';
import { resolveForwardActorHeaders } from './forward-actor-headers.js';
import { HealthController } from './health.controller.js';
import { IdentityProxyController } from './identity-proxy.controller.js';
import { SessionController } from './session.controller.js';

const providers: Provider[] = [
  {
    provide: ACTIVITY_SERVICE_BASE_URL,
    useFactory: (): string | null => {
      const value = process.env.ACTIVITY_SERVICE_BASE_URL?.trim();
      return value !== undefined && value.length > 0 ? value : null;
    },
  },
  {
    provide: IDENTITY_SERVICE_BASE_URL,
    useFactory: (): string | null => {
      const value =
        process.env.IDENTITY_SERVICE_BASE_URL?.trim() ??
        process.env.INTERNAL_JWT_IDENTITY_BASE_URL?.trim();
      return value !== undefined && value.length > 0 ? value : null;
    },
  },
  {
    provide: API_GATEWAY_FORWARD_ACTOR_HEADERS,
    useFactory: (): boolean => resolveForwardActorHeaders(process.env),
  },
  {
    provide: ACTIVITY_ASSERTION_CONFIG,
    useFactory: (): ActivityAssertionConfig | null =>
      readActivityAssertionConfigFromEnv(process.env),
  },
];

@Module({
  controllers: [
    HealthController,
    ActivityProxyController,
    IdentityProxyController,
    SessionController,
  ],
  providers,
})
export class AppModule {}
