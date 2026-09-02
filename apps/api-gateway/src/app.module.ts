import { Module, type Provider } from '@nestjs/common';

import { readActivityAssertionConfigFromEnv } from './activity-assertion.js';
import { ActivityProxyController } from './activity-proxy.controller.js';
import {
  ACTIVITY_ASSERTION_CONFIG,
  ACTIVITY_SERVICE_BASE_URL,
  API_GATEWAY_FORWARD_ACTOR_HEADERS,
  DISCORD_GATEWAY_BASE_URL,
  IDENTITY_SERVICE_BASE_URL,
  type ActivityAssertionConfig,
} from './activity-proxy.tokens.js';
import { resolveForwardActorHeaders } from './forward-actor-headers.js';
import { HealthController } from './health.controller.js';
import { IdentityProxyController } from './identity-proxy.controller.js';
import { readPlayerWorkspaceAssertionConfigFromEnv } from './player-workspace-assertion.js';
import { PlayerWorkspaceProxyController } from './player-workspace-proxy.controller.js';
import {
  PLAYER_WORKSPACE_ASSERTION_CONFIG,
  PLAYER_WORKSPACE_SERVICE_BASE_URL,
  type PlayerWorkspaceAssertionConfig,
} from './player-workspace-proxy.tokens.js';
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
    provide: PLAYER_WORKSPACE_SERVICE_BASE_URL,
    useFactory: (): string | null => {
      const value = process.env.PLAYER_WORKSPACE_SERVICE_BASE_URL?.trim();
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
    provide: DISCORD_GATEWAY_BASE_URL,
    useFactory: (): string | null => {
      const value = process.env.DISCORD_GATEWAY_BASE_URL?.trim();
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
  {
    provide: PLAYER_WORKSPACE_ASSERTION_CONFIG,
    useFactory: (): PlayerWorkspaceAssertionConfig | null =>
      readPlayerWorkspaceAssertionConfigFromEnv(process.env),
  },
];

@Module({
  controllers: [
    HealthController,
    ActivityProxyController,
    PlayerWorkspaceProxyController,
    IdentityProxyController,
    SessionController,
  ],
  providers,
})
export class AppModule {}
