import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { createLogger } from '@v2/observability';

import { DailyCharacterTimerPanelScheduler, refreshExistingDailyCharacterTimerPanels } from '../../application/notify/daily-character-timer-panel-runtime.js';
import { startCharacterTimerReminderWorker } from '../../application/notify/character-timer-reminders.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import {
  DISCORD_CONFIG_TOKEN,
  DISCORD_GATEWAY_TOKEN,
} from './discord.tokens.js';

@Injectable()
export class DailyCharacterTimerPanelBootstrapService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private scheduler: DailyCharacterTimerPanelScheduler | null = null;
  private readonly logger = createLogger('daily-character-timer-panels');

  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
    @Inject(DISCORD_GATEWAY_TOKEN) private readonly gateway: DiscordJsGatewayAdapter | null,
  ) {}

  public onApplicationBootstrap(): void {
    if (!this.config.DISCORD_ENABLED || !this.gateway) return;

    this.scheduler = new DailyCharacterTimerPanelScheduler({
      config: this.config,
      gateway: this.gateway,
      logger: this.logger,
    });
    this.scheduler.start();

    // This intentionally replaces the legacy reminder sender. Persisted timer jobs
    // now refresh the one daily panel in place instead of creating standalone DMs.
    startCharacterTimerReminderWorker({
      logger: this.logger,
      send: async (job) => {
        if (!job.workspaceId) return;
        await refreshExistingDailyCharacterTimerPanels({
          config: this.config,
          gateway: this.gateway!,
          logger: this.logger,
          workspaceId: job.workspaceId,
        });
      },
    });
  }

  public onModuleDestroy(): void {
    this.scheduler?.stop();
    this.scheduler = null;
  }
}
