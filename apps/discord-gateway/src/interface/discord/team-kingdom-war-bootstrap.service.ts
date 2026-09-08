import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createLogger } from '@v2/observability';

import { getKingdomWarClaims } from '../../application/notify/kingdom-war-claims.js';
import { listTeamKingdomWarRecipientScopes } from '../../application/notify/kingdom-war-team-recipients.js';
import { KingdomWarScheduler } from '../../application/notify/kingdom-war-scheduler.js';
import { resolveActiveBotConfig } from '../../application/technika/active-bot-config.js';
import type { VersionedConfigStore } from '../../application/technika/versioned-config-store.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import { readSharedKingdomWarWorkspaceContext } from '../../infrastructure/player-team/read-team-workspace-context.js';
import { renderKingdomWarReminder } from '../../presentation/discord/kingdom-war-renderer.js';
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
      getKingdomWar: () => resolveActiveBotConfig(this.store).kingdomWar,
      onFire: async ({ warAt, notifyAt, dayKey }) => {
        const warCfg = resolveActiveBotConfig(this.store).kingdomWar;
        if (!warCfg.enabled || this.gateway === null) return;

        const scopes = listTeamKingdomWarRecipientScopes();
        if (scopes.length === 0) {
          logger.info('Team kingdom war skipped — no team scopes', { warAt, notifyAt, dayKey });
          return;
        }

        for (const scope of scopes) {
          // The persisted scope is only a discovery seed. Before every delivery we
          // re-read the exact shared workspace and recompute current membership +
          // kingdomWar preferences. Stale/removed members therefore never receive
          // a DM merely because they were present in yesterday's file.
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
          if (context.recipients.length === 0) {
            logger.info('Team kingdom war skipped — team has no opted-in recipients', {
              workspaceId: scope.workspaceId,
              dayKey,
            });
            continue;
          }

          const rendered = renderKingdomWarReminder({
            config: warCfg,
            signingSecret: this.config.DISCORD_COMPONENT_SIGNING_SECRET,
            claims: getKingdomWarClaims(scope.workspaceId),
            ...(context.roster.length ? { roster: context.roster } : {}),
          });
          const teamPrefix = `**Zespół: ${context.workspaceName}**`;
          const content = `${teamPrefix}\n${rendered.content ?? `Wojna królestw ${warAt}`}`.slice(0, 1900);

          let sent = 0;
          let skipped = 0;
          for (const discordUserId of context.recipients) {
            try {
              await this.gateway.sendTimerNotify({
                discordUserId,
                content,
                ...(rendered.components ? { components: rendered.components } : {}),
              });
              sent += 1;
            } catch (error) {
              skipped += 1;
              logger.warn('Team kingdom war DM failed', {
                workspaceId: scope.workspaceId,
                discordUserId,
                dayKey,
                error: error instanceof Error ? error.message : 'unknown',
              });
            }
          }

          logger.info('Team kingdom war reminder fired', {
            workspaceId: scope.workspaceId,
            warAt,
            notifyAt,
            dayKey,
            sent,
            skipped,
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
