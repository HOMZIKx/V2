import { Module, type Provider } from '@nestjs/common';
import type { Pool } from 'pg';

import type { ActivityRepositoryPort, AuthorizePort } from '../application/ports/activity.ports.js';
import type { DiscordChannelValidationPort } from '../application/ports/discord-channel-validation.port.js';
import type { DiscordGuildMetadataPort } from '../application/ports/discord-guild-metadata.port.js';
import { ActivityAdminUseCases } from '../application/use-cases/activity-admin.use-cases.js';
import { ActivityUseCases } from '../application/use-cases/activity.use-cases.js';
import { type Clock, SystemClock } from '../domain/clock.js';
import {
  AllowAllAuthorizationClient,
  HttpAuthorizationClient,
} from '../infrastructure/authorization/authorization-client.js';
import { type ActivityEnv, parseActivityEnv } from '../infrastructure/config/activity-env.js';
import { createActivityPool } from '../infrastructure/db/pg-pool.js';
import { createDiscordChannelValidationPort } from '../infrastructure/discord/discord-channel-validation-client.js';
import { createDiscordGuildMetadataPort } from '../infrastructure/discord/discord-guild-metadata-client.js';
import {
  type AssertionJtiStore,
  createAssertionJtiStore,
} from '../infrastructure/internal/assertion-jti-store.js';
import {
  type InboundClientRegistry,
  loadInboundClientRegistry,
} from '../infrastructure/internal/verify-inbound-assertion.js';
import { ActivityOutboxDispatcher } from '../infrastructure/outbox/outbox-dispatcher.js';
import { ActivityRepository } from '../infrastructure/persistence/activity-repository.js';
import { ActivityAdminController } from './activity-admin.controller.js';
import { ActivityController } from './activity.controller.js';
import {
  ACTIVITY_ADMIN_USE_CASES,
  ACTIVITY_CLOCK,
  ACTIVITY_CONFIG,
  ACTIVITY_POOL,
  ACTIVITY_REPOSITORY,
  ACTIVITY_USE_CASES,
  ASSERTION_JTI_STORE,
  AUTHORIZE_PORT,
  DISCORD_CHANNEL_VALIDATION,
  DISCORD_GUILD_METADATA,
  INBOUND_CLIENT_REGISTRY,
} from './activity.tokens.js';
import { HealthController } from './health.controller.js';
import { InboundAssertionGuard } from './inbound-assertion.guard.js';

const providers: Provider[] = [
  {
    provide: ACTIVITY_CONFIG,
    useFactory: (): ActivityEnv => parseActivityEnv(process.env),
  },
  {
    provide: ACTIVITY_POOL,
    useFactory: (config: ActivityEnv): Pool => createActivityPool(config.ACTIVITY_DATABASE_URL),
    inject: [ACTIVITY_CONFIG],
  },
  {
    provide: ACTIVITY_REPOSITORY,
    useFactory: (pool: Pool): ActivityRepositoryPort => new ActivityRepository(pool),
    inject: [ACTIVITY_POOL],
  },
  {
    provide: AUTHORIZE_PORT,
    useFactory: (config: ActivityEnv): AuthorizePort => {
      if (!config.ACTIVITY_ENABLED) {
        return new AllowAllAuthorizationClient();
      }
      const client = HttpAuthorizationClient.fromEnv(config);
      if (client === null) {
        throw new Error(
          'Authorization client could not be constructed while ACTIVITY_ENABLED=true',
        );
      }
      return client;
    },
    inject: [ACTIVITY_CONFIG],
  },
  {
    provide: ACTIVITY_CLOCK,
    useFactory: (): Clock => new SystemClock(),
  },
  {
    provide: DISCORD_CHANNEL_VALIDATION,
    useFactory: (config: ActivityEnv): DiscordChannelValidationPort | null =>
      createDiscordChannelValidationPort(config),
    inject: [ACTIVITY_CONFIG],
  },
  {
    provide: DISCORD_GUILD_METADATA,
    useFactory: (config: ActivityEnv): DiscordGuildMetadataPort | null =>
      createDiscordGuildMetadataPort(config),
    inject: [ACTIVITY_CONFIG],
  },
  {
    provide: ACTIVITY_USE_CASES,
    useFactory: (
      repository: ActivityRepositoryPort,
      authorize: AuthorizePort,
      clock: Clock,
      config: ActivityEnv,
    ): ActivityUseCases =>
      new ActivityUseCases({
        repository,
        authorize,
        clock,
        allowTestSeed: config.ACTIVITY_ALLOW_TEST_SEED,
        nodeEnv: config.NODE_ENV,
      }),
    inject: [ACTIVITY_REPOSITORY, AUTHORIZE_PORT, ACTIVITY_CLOCK, ACTIVITY_CONFIG],
  },
  {
    provide: ACTIVITY_ADMIN_USE_CASES,
    useFactory: (
      repository: ActivityRepositoryPort,
      authorize: AuthorizePort,
      clock: Clock,
      config: ActivityEnv,
      discordChannelValidation: DiscordChannelValidationPort | null,
      discordGuildMetadata: DiscordGuildMetadataPort | null,
    ): ActivityAdminUseCases =>
      new ActivityAdminUseCases({
        repository,
        authorize,
        clock,
        allowTestSeed: config.ACTIVITY_ALLOW_TEST_SEED,
        nodeEnv: config.NODE_ENV,
        discordChannelValidation,
        discordGuildMetadata,
      }),
    inject: [
      ACTIVITY_REPOSITORY,
      AUTHORIZE_PORT,
      ACTIVITY_CLOCK,
      ACTIVITY_CONFIG,
      DISCORD_CHANNEL_VALIDATION,
      DISCORD_GUILD_METADATA,
    ],
  },
  {
    provide: INBOUND_CLIENT_REGISTRY,
    useFactory: async (config: ActivityEnv): Promise<InboundClientRegistry | null> => {
      if (!config.ACTIVITY_ENABLED || config.ACTIVITY_INBOUND_CLIENTS_JSON === undefined) {
        return null;
      }
      return loadInboundClientRegistry(config.ACTIVITY_INBOUND_CLIENTS_JSON);
    },
    inject: [ACTIVITY_CONFIG],
  },
  {
    provide: ASSERTION_JTI_STORE,
    useFactory: (config: ActivityEnv): AssertionJtiStore | null => {
      if (!config.ACTIVITY_ENABLED || config.ACTIVITY_REDIS_URL === undefined) {
        return null;
      }
      return createAssertionJtiStore(
        config.ACTIVITY_REDIS_URL,
        config.ACTIVITY_ASSERTION_JTI_REDIS_PREFIX,
      );
    },
    inject: [ACTIVITY_CONFIG],
  },
  InboundAssertionGuard,
  ActivityOutboxDispatcher,
];

@Module({
  controllers: [HealthController, ActivityController, ActivityAdminController],
  providers,
})
export class AppModule {}
