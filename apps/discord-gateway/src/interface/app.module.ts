import { Module } from '@nestjs/common';

import {
  createActivityHttpClientOrNull,
  type ActivityHttpClient,
} from '../infrastructure/activity/activity-http-client.js';
import {
  createDiscordGatewayOrNull,
  DiscordBootstrapService,
  loadDiscordConfig,
} from './discord/discord-bootstrap.service.js';
import {
  DISCORD_ACTIVITY_CLIENT_TOKEN,
  DISCORD_CONFIG_TOKEN,
  DISCORD_GATEWAY_TOKEN,
} from './discord/discord.tokens.js';
import { ActivityChannelValidationController } from './http/activity-channel-validation.controller.js';
import { ActivityProjectionController } from './http/activity-projection.controller.js';
import { HealthController } from './http/health.controller.js';

@Module({
  controllers: [
    HealthController,
    ActivityProjectionController,
    ActivityChannelValidationController,
  ],
  providers: [
    {
      provide: DISCORD_CONFIG_TOKEN,
      useFactory: () => loadDiscordConfig(),
    },
    {
      provide: DISCORD_ACTIVITY_CLIENT_TOKEN,
      useFactory: (config: ReturnType<typeof loadDiscordConfig>): ActivityHttpClient | null =>
        createActivityHttpClientOrNull(config),
      inject: [DISCORD_CONFIG_TOKEN],
    },
    {
      provide: DISCORD_GATEWAY_TOKEN,
      useFactory: createDiscordGatewayOrNull,
      inject: [DISCORD_CONFIG_TOKEN, DISCORD_ACTIVITY_CLIENT_TOKEN],
    },
    DiscordBootstrapService,
  ],
})
export class AppModule {}
