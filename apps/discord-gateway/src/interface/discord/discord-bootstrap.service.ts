import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createLogger } from '@v2/observability';

import { createConfig } from '@v2/configuration';
import { guildCommandDefinitions } from '../../application/commands/command-definitions.js';
import { resolveActiveBotConfig } from '../../application/technika/active-bot-config.js';
import type { VersionedConfigStore } from '../../application/technika/versioned-config-store.js';
import type { MemberActivityCollector } from '../../application/member-activity/member-activity-collector.js';
import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
  type DiscordGatewayConfig,
} from '../../infrastructure/discord/discord-config.js';
import { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import { DailyPanelInteractionRouter } from './daily-panel-interaction-router.js';
import {
  DISCORD_CONFIG_TOKEN,
  DISCORD_GATEWAY_TOKEN,
  TECHNIKA_CONFIG_STORE_TOKEN,
} from './discord.tokens.js';

const DESTILED_GUILD_ID = '1543972927719080016';
const SOJUSZ_GUILD_ID = '1531318787058696424';
const AUTHORIZATION_SYNC_RETRY_MS = 30_000;

type RuntimeGuild = { readonly id: string };
type GatewayAuthorizationSyncInternals = {
  readonly client: {
    readonly guilds: {
      readonly cache: ReadonlyMap<string, RuntimeGuild>;
    };
  };
  runtimeAllowedGuildIds(): Set<string>;
  registerAndReconcile(guild: RuntimeGuild): Promise<void>;
  syncAllowedGuildOnReady(): Promise<void>;
};

type GatewaySyncLogger = {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
};

function resolveRuntimeAllowedGuildIds(
  config: DiscordGatewayConfig,
  technikaStore?: VersionedConfigStore | null,
): string[] {
  const ids = new Set<string>([
    config.DISCORD_TEST_GUILD_ID,
    DESTILED_GUILD_ID,
    SOJUSZ_GUILD_ID,
  ]);

  const botConfig = resolveActiveBotConfig(technikaStore ?? null);
  const guilds = botConfig.guilds ?? {};
  for (const id of Object.keys(guilds)) {
    if (/^\d{17,20}$/.test(id)) ids.add(id);
  }

  const memberActivity = botConfig.memberActivity;
  if (memberActivity?.guildId && /^\d{17,20}$/.test(memberActivity.guildId)) {
    ids.add(memberActivity.guildId);
  }

  return [...ids];
}

function installResilientAuthorizationStartupSync(
  gateway: DiscordJsGatewayAdapter,
  logger: GatewaySyncLogger,
): void {
  const internals = gateway as unknown as GatewayAuthorizationSyncInternals;
  let retryTimer: NodeJS.Timeout | null = null;

  const syncRuntimeGuilds = async (): Promise<void> => {
    let failed = false;
    let synced = 0;

    for (const guildId of internals.runtimeAllowedGuildIds()) {
      const guild = internals.client.guilds.cache.get(guildId);
      if (guild === undefined) continue;
      try {
        await internals.registerAndReconcile(guild);
        synced += 1;
      } catch (error) {
        failed = true;
        logger.warn('Authorization guild sync failed; Discord gateway stays online', {
          guildId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!failed) {
      if (synced > 0) logger.info('Authorization startup sync completed for runtime guilds', { synced });
      return;
    }
    if (retryTimer !== null) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void syncRuntimeGuilds();
    }, AUTHORIZATION_SYNC_RETRY_MS);
    retryTimer.unref?.();
  };

  internals.syncAllowedGuildOnReady = syncRuntimeGuilds;
}

@Injectable()
export class DiscordBootstrapService implements OnModuleInit, OnModuleDestroy {
  private readonly nestLogger = new Logger(DiscordBootstrapService.name);

  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
    @Inject(DISCORD_GATEWAY_TOKEN)
    private readonly gateway: DiscordJsGatewayAdapter | null,
    @Inject(TECHNIKA_CONFIG_STORE_TOKEN)
    private readonly technikaStore: VersionedConfigStore,
  ) {}

  public async onModuleInit(): Promise<void> {
    if (!this.config.DISCORD_ENABLED || this.gateway === null) {
      this.nestLogger.log('Discord disabled; gateway staying in safe mode.');
      return;
    }

    try {
      await this.gateway.start();
    } catch (error) {
      this.nestLogger.error(
        `Discord bot startup failed; HTTP gateway remains online: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }

    if (this.config.DISCORD_AUTO_REGISTER_GUILD_COMMANDS) {
      const guildIds = resolveRuntimeAllowedGuildIds(this.config, this.technikaStore);
      for (const guildId of guildIds) {
        try {
          await this.gateway.putGuildCommands(guildId, guildCommandDefinitions);
          this.nestLogger.log(`Guild commands auto-registered for ${guildId}.`);
        } catch (error) {
          this.nestLogger.warn(
            `Guild command registration failed for ${guildId}: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          );
        }
      }
    }

    // Standalone character-timer DMs and the old global war sender intentionally
    // do not start here. Timer delivery is owned by DailyCharacterTimerPanelBootstrapService;
    // war delivery is owned by TeamKingdomWarBootstrapService.
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.gateway) await this.gateway.stop();
  }
}

export function loadDiscordConfig(): DiscordGatewayConfig {
  const parsed = createConfig(DiscordGatewayConfigSchema);
  return normalizeDiscordConfig(parsed);
}

export function createDiscordGatewayOrNull(
  config: DiscordGatewayConfig,
  technikaStore?: VersionedConfigStore | null,
  memberActivityCollector?: MemberActivityCollector | null,
): DiscordJsGatewayAdapter | null {
  if (!config.DISCORD_ENABLED) return null;

  const logger = createLogger('discord-gateway');
  const routerHolder: { current: DailyPanelInteractionRouter | null } = { current: null };

  const gateway = new DiscordJsGatewayAdapter({
    config,
    logger,
    getRuntimeAllowedGuildIds: () => resolveRuntimeAllowedGuildIds(config, technikaStore),
    memberActivityCollector: memberActivityCollector ?? null,
    onInteraction: async (interaction) => {
      if (routerHolder.current === null) return;
      await routerHolder.current.handle(interaction);
    },
  });

  installResilientAuthorizationStartupSync(gateway, logger);

  routerHolder.current = new DailyPanelInteractionRouter({
    config,
    gateway,
    logger,
    getBotConfig: () => resolveActiveBotConfig(technikaStore ?? null),
  });

  return gateway;
}
