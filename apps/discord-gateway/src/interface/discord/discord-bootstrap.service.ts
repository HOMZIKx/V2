import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createLogger } from '@v2/observability';

import { createConfig } from '@v2/configuration';
import { guildCommandDefinitions } from '../../application/commands/command-definitions.js';
import { resolveActiveBotConfig } from '../../application/technika/active-bot-config.js';
import type { VersionedConfigStore } from '../../application/technika/versioned-config-store.js';
import { getKingdomWarClaims } from '../../application/notify/kingdom-war-claims.js';
import { startCharacterTimerReminderWorker } from '../../application/notify/character-timer-reminders.js';
import { formatTimerNotifyContent } from '../../application/notify/notify-payload.js';
import { renderTimerNotifyMessage } from '../../presentation/discord/timer-notify-renderer.js';
import { listKingdomWarRecipients } from '../../application/notify/kingdom-war-recipients.js';
import { KingdomWarScheduler } from '../../application/notify/kingdom-war-scheduler.js';
import { InteractionRouter } from './interaction-router.js';

import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
  type DiscordGatewayConfig,
} from '../../infrastructure/discord/discord-config.js';
import { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import type { MemberActivityCollector } from '../../application/member-activity/member-activity-collector.js';
import { renderKingdomWarReminder } from '../../presentation/discord/kingdom-war-renderer.js';
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

/**
 * Startup Discord connectivity and Authorization membership synchronization are
 * separate concerns. A temporary Authz outage must not tear down the connected
 * Discord client. Also reconcile every joined runtime guild, not only the legacy
 * DISCORD_TEST_GUILD_ID, so existing Destiled/Sojusz members can log in.
 *
 * The adapter currently keeps these hooks private; install the production startup
 * policy on the instance until the adapter exposes a first-class sync supervisor.
 */
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
      if (guild === undefined) {
        continue;
      }

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
      if (synced > 0) {
        logger.info('Authorization startup sync completed for runtime guilds', { synced });
      }
      return;
    }

    if (retryTimer !== null) {
      return;
    }

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
  private warScheduler: KingdomWarScheduler | null = null;

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
      // The HTTP gateway must remain live even when the Discord session cannot
      // start (bad token/intents, Discord outage, guild configuration). Health
      // endpoints expose the adapter's failed state and lastError so deployment
      // diagnostics do not turn into a process crash / opaque HTTP 500.
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

    const gateway = this.gateway;
    const config = this.config;
    const store = this.technikaStore;
    const logger = createLogger('kingdom-war-scheduler');
    this.warScheduler = new KingdomWarScheduler({
      logger,
      getKingdomWar: () => resolveActiveBotConfig(store).kingdomWar,
      onFire: async ({ warAt, notifyAt, dayKey }) => {
        const warCfg = resolveActiveBotConfig(store).kingdomWar;
        if (!warCfg.enabled) {
          return;
        }
        const message = renderKingdomWarReminder({
          config: warCfg,
          signingSecret: config.DISCORD_COMPONENT_SIGNING_SECRET,
          claims: getKingdomWarClaims(),
        });
        // HARD: ONLY team recipients registered from notifyPrefs.kingdomWar.
        // Never DM whole guild / never fan-out via guild.members / never operatorIds blast.
        const warRecipients = listKingdomWarRecipients();
        if (warRecipients.length === 0) {
          logger.info('Kingdom war reminder skipped — no prefs-eligible team recipients', {
            warAt,
            notifyAt,
            dayKey,
          });
          return;
        }
        let sent = 0;
        let skipped = 0;
        for (const discordUserId of warRecipients) {
          try {
            await gateway.sendTimerNotify({
              discordUserId,
              content: message.content ?? `Wojna królestw ${warAt}`,
              ...(message.components ? { components: message.components } : {}),
            });
            sent += 1;
          } catch (error) {
            skipped += 1;
            logger.warn('Kingdom war DM failed', {
              discordUserId,
              dayKey,
              notifyAt,
              error: error instanceof Error ? error.message : 'unknown',
            });
          }
        }
        logger.info('Kingdom war reminder fired', {
          warAt,
          notifyAt,
          dayKey,
          sent,
          skipped,
          recipientCount: warRecipients.length,
        });
      },
    });
    this.warScheduler.start();

    // Reload durable "Przypomnij później" queue after restart.
    startCharacterTimerReminderWorker({
      logger: createLogger('character-timer-reminders'),
      send: async (job) => {
        const body = {
          discordUserId: job.discordUserId,
          title: `${job.label}${job.characterName ? ` · ${job.characterName}` : ''}`,
          body: `Przypomnienie: timer postaci kończy się / czeka na Ciebie. Oznacz numer na liście LIVE albo Gotowe na karcie.`,
          deepLinkUrl: 'https://destiled.app/timers',
          timerId: job.timerId,
          timerLabel: job.label,
          ...(job.characterId ? { characterId: job.characterId } : { workspaceId: 'team' }),
          ...(job.characterName ? { characterName: job.characterName } : {}),
          kind: 'reminder' as const,
          includeButtons: true,
          idempotencyKey: `char-timer-later:${job.timerId}:${job.discordUserId}:${job.fireAtMs}`,
        };
        const content = formatTimerNotifyContent(body);
        const message = renderTimerNotifyMessage({
          payload: body,
          content,
          signingSecret: config.DISCORD_COMPONENT_SIGNING_SECRET,
          includeButtons: true,
        });
        await gateway.sendTimerNotify({
          discordUserId: job.discordUserId,
          content: message.content ?? content,
          ...(message.components ? { components: message.components } : {}),
        });
      },
    });
  }

  public async onModuleDestroy(): Promise<void> {
    this.warScheduler?.stop();
    this.warScheduler = null;
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
  technikaStore?: VersionedConfigStore | null,
  memberActivityCollector?: MemberActivityCollector | null,
): DiscordJsGatewayAdapter | null {
  if (!config.DISCORD_ENABLED) {
    return null;
  }

  const logger = createLogger('discord-gateway');
  const routerHolder: { current: InteractionRouter | null } = { current: null };

  const gateway = new DiscordJsGatewayAdapter({
    config,
    logger,
    getRuntimeAllowedGuildIds: () => resolveRuntimeAllowedGuildIds(config, technikaStore),
    memberActivityCollector: memberActivityCollector ?? null,
    onInteraction: async (interaction) => {
      if (routerHolder.current === null) {
        return;
      }
      await routerHolder.current.handle(interaction);
    },
  });

  installResilientAuthorizationStartupSync(gateway, logger);

  routerHolder.current = new InteractionRouter({
    config,
    gateway,
    logger,
    getBotConfig: () => resolveActiveBotConfig(technikaStore ?? null),
  });

  return gateway;
}
