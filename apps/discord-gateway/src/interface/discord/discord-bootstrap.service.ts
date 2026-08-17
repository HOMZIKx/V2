import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createLogger } from '@v2/observability';

import { createConfig } from '@v2/configuration';
import { guildCommandDefinitions } from '../../application/commands/command-definitions.js';
import type { ActivityHttpClient } from '../../infrastructure/activity/activity-http-client.js';
import { runStartupHubReconcile } from '../../application/interactions/hub-startup-reconcile.js';
import { InteractionRouter } from './interaction-router.js';

import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
  type DiscordGatewayConfig,
} from '../../infrastructure/discord/discord-config.js';
import { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import {
  DISCORD_ACTIVITY_CLIENT_TOKEN,
  DISCORD_CONFIG_TOKEN,
  DISCORD_GATEWAY_TOKEN,
} from './discord.tokens.js';

@Injectable()
export class DiscordBootstrapService implements OnModuleInit, OnModuleDestroy {
  private readonly nestLogger = new Logger(DiscordBootstrapService.name);

  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
    @Inject(DISCORD_GATEWAY_TOKEN)
    private readonly gateway: DiscordJsGatewayAdapter | null,
    @Inject(DISCORD_ACTIVITY_CLIENT_TOKEN)
    private readonly activityClient: ActivityHttpClient | null,
  ) {}

  public async onModuleInit(): Promise<void> {
    if (!this.config.DISCORD_ENABLED || this.gateway === null) {
      this.nestLogger.log('Discord disabled; gateway staying in safe mode.');
      return;
    }

    try {
      await this.gateway.start();

      if (this.config.DISCORD_AUTO_REGISTER_GUILD_COMMANDS) {
        await this.gateway.putGuildCommands(
          this.config.DISCORD_TEST_GUILD_ID,
          guildCommandDefinitions,
        );
        this.nestLogger.log('Guild commands auto-registered for test guild.');
      }

      if (this.activityClient !== null) {
        const logger = createLogger('discord-gateway');
        await runStartupHubReconcile({
          config: this.config,
          gateway: this.gateway,
          activityClient: this.activityClient,
          logger,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.nestLogger.error(
        'Discord client failed to start; HTTP listener stays up for diagnostics and projection APIs.',
        message,
      );
    }
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.gateway) {
      await this.gateway.stop();
    }
  }
}

export function loadDiscordConfig(): DiscordGatewayConfig {
  const parsed = createConfig(DiscordGatewayConfigSchema);
  return normalizeDiscordConfig(parsed);
}

export function createDiscordGatewayOrNull(
  config: DiscordGatewayConfig,
  activityClient: ActivityHttpClient | null = null,
): DiscordJsGatewayAdapter | null {
  if (!config.DISCORD_ENABLED) {
    return null;
  }

  const logger = createLogger('discord-gateway');
  const routerHolder: { current: InteractionRouter | null } = { current: null };

  const gateway = new DiscordJsGatewayAdapter({
    config,
    logger,
    onInteraction: async (interaction) => {
      if (routerHolder.current === null) {
        return;
      }
      await routerHolder.current.handle(interaction);
    },
  });

  routerHolder.current = new InteractionRouter({
    config,
    gateway,
    logger,
    activityClient: config.DISCORD_ACTIVITY_ENABLED ? activityClient : null,
  });

  return gateway;
}

// Re-export token for Nest DI clarity (bootstrap factory injects activity client).
export { DISCORD_ACTIVITY_CLIENT_TOKEN };
