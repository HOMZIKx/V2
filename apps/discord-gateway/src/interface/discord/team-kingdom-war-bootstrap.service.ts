import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createLogger } from '@v2/observability';

import { publishKingdomWarPanels } from '../../application/notify/kingdom-war-panel-runtime.js';
import { listTeamKingdomWarRecipientScopes } from '../../application/notify/kingdom-war-team-recipients.js';
import { KingdomWarScheduler } from '../../application/notify/kingdom-war-scheduler.js';
import { resolveActiveBotConfig } from '../../application/technika/active-bot-config.js';
import type { VersionedConfigStore } from '../../application/technika/versioned-config-store.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import { readSharedKingdomWarWorkspaceContext } from '../../infrastructure/player-team/read-team-workspace-context.js';
import {
  DISCORD_CONFIG_TOKEN,
  DISCORD_GATEWAY_TOKEN,
  TECHNIKA_CONFIG_STORE_TOKEN,
} from './discord.tokens.js';

const logger = createLogger('team-kingdom-war-scheduler');

@Injectable()
export class TeamKingdomWarBootstrapService implements OnModuleInit, OnModuleDestroy {
  private scheduler: KingdomWarScheduler | null = null;

  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
    @Inject(DISCORD_GATEWAY_TOKEN) private readonly gateway: DiscordJsGatewayAdapter | null,
    @Inject(TECHNIKA_CONFIG_STORE_TOKEN) private readonly store: VersionedConfigStore,
  ) {}

  public onModuleInit(): void {
    if (!this.config.DISCORD_ENABLED || this.gateway === null) return;

    this.scheduler = new KingdomWarScheduler({
      logger,
      // Product rule: the team war panel is always delivered exactly 30 minutes before war.
      getKingdomWar: () => ({
        ...resolveActiveBotConfig(this.store).kingdomWar,
        notifyMinutesBefore: 30,
      }),
      onFire: async ({ warAt, notifyAt, dayKey }) => {
        const warCfg = {
          ...resolveActiveBotConfig(this.store).kingdomWar,
          notifyMinutesBefore: 30,
        };
        if (!warCfg.enabled || this.gateway === null) return;

        const scopes = listTeamKingdomWarRecipientScopes();
        if (scopes.length === 0) {
          logger.info('Team kingdom war skipped — no team scopes', { warAt, notifyAt, dayKey });
          return;
        }

        for (const scope of scopes) {
          let context = null;
          for (const seedDiscordUserId of scope.recipients) {
            context = await readSharedKingdomWarWorkspaceContext({
              baseUrl: this.config.PLAYER_TEAM_BASE_URL,
              demoViewerHeader: this.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
              viewerId: seedDiscordUserId,
              workspaceId: scope.workspaceId,
            });
            if (context) break;
          }

          if (!context) {
            logger.warn('Team kingdom war skipped — exact workspace could not be verified', {
              workspaceId: scope.workspaceId,
              dayKey,
            });
            continue;
          }
          if (context.recipients.length === 0) continue;

          const delivered = await publishKingdomWarPanels({
            gateway: this.gateway,
            discordConfig: this.config,
            warConfig: warCfg,
            context,
            dayKey,
            logger,
          });

          logger.info('Team kingdom war panel fired', {
            workspaceId: scope.workspaceId,
            warAt,
            notifyAt,
            dayKey,
            delivered,
            recipientCount: context.recipients.length,
          });
        }
      },
    });
    this.scheduler.start();
  }

  public onModuleDestroy(): void {
    this.scheduler?.stop();
    this.scheduler = null;
  }
}
