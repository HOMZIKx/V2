import { Module } from '@nestjs/common';

import {
  createDiscordGatewayOrNull,
  DiscordBootstrapService,
  loadDiscordConfig,
} from './discord/discord-bootstrap.service.js';
import { DISCORD_CONFIG_TOKEN, DISCORD_GATEWAY_TOKEN } from './discord/discord.tokens.js';
import { HealthController } from './http/health.controller.js';

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: DISCORD_CONFIG_TOKEN,
      useFactory: () => loadDiscordConfig(),
    },
    {
      provide: DISCORD_GATEWAY_TOKEN,
      useFactory: createDiscordGatewayOrNull,
      inject: [DISCORD_CONFIG_TOKEN],
    },
    DiscordBootstrapService,
  ],
})
export class AppModule {}
