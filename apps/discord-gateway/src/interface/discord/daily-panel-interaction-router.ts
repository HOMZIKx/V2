import { MessageFlags, type Interaction, type MessageComponentInteraction } from 'discord.js';

import {
  cancelCharacterTimerReminder,
  scheduleCharacterTimerReminder,
} from '../../application/notify/character-timer-reminders.js';
import {
  getDailyCharacterTimerPanelConfig,
} from '../../application/notify/daily-character-timer-panel-registry.js';
import {
  refreshExistingDailyCharacterTimerPanels,
  switchDailyCharacterTimerPanelCharacter,
} from '../../application/notify/daily-character-timer-panel-runtime.js';
import { canonicalOwnerViewerId } from '../../infrastructure/player-team/owner-viewer-id.js';
import { readCharacterTimerCardFromBot } from '../../infrastructure/player-team/read-character-timer-card.js';
import { refreshSharedCharacterTimer } from '../../infrastructure/player-team/refresh-shared-character-timer.js';
import { parseCharacterTimerButtonCustomId } from '../../infrastructure/security/character-timer-custom-id.js';
import { parseCharacterTimerPanelSelectCustomId } from '../../infrastructure/security/character-timer-panel-custom-id.js';
import { TeamSyncInteractionRouter } from './team-sync-interaction-router.js';
import type { InteractionRouterDeps } from './interaction-router.js';

export class DailyPanelInteractionRouter {
  private readonly base: TeamSyncInteractionRouter;

  public constructor(private readonly deps: InteractionRouterDeps) {
    this.base = new TeamSyncInteractionRouter(deps);
  }

  public async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isMessageComponent()) {
      await this.base.handle(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      try {
        const selector = parseCharacterTimerPanelSelectCustomId(
          interaction.customId,
          this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
        );
        const characterId = interaction.values[0]?.trim();
        if (!characterId) {
          await interaction.reply({ content: 'Nie wybrano postaci.', flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.deferUpdate();
        const ok = await switchDailyCharacterTimerPanelCharacter({
          config: this.deps.config,
          gateway: this.deps.gateway,
          logger: this.deps.logger,
          workspaceId: selector.workspaceId,
          discordUserId: interaction.user.id,
          characterId,
        });
        if (!ok) {
          await interaction.followUp({
            content: 'Nie udało się przełączyć postaci w panelu timerów.',
            flags: MessageFlags.Ephemeral,
          });
        }
        return;
      } catch {
        // not the daily timer selector
      }
    }

    if (interaction.isButton()) {
      try {
        const timerButton = parseCharacterTimerButtonCustomId(
          interaction.customId,
          this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
        );
        await this.handleCharacterTimerAction(interaction, timerButton.operation, timerButton.payload.timerId);
        return;
      } catch {
        // not a character timer button
      }
    }

    await this.base.handle(interaction);
  }

  private async handleCharacterTimerAction(
    interaction: MessageComponentInteraction,
    operation: 'gotowe' | 'przypomnij',
    timerId: string,
  ): Promise<void> {
    if (operation === 'przypomnij') {
      await interaction.reply({
        content: 'Ten stary typ przypomnienia został wyłączony. Aktualny stan jest utrzymywany w jednym dziennym panelu PW.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferUpdate();
    const viewerId = canonicalOwnerViewerId(interaction.user.id);
    const located = await readCharacterTimerCardFromBot({
      baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
      demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
      viewerId,
      timerId,
    });
    if (!located?.workspaceId) {
      await interaction.followUp({
        content: 'Nie udało się odnaleźć timera w zespole.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const actorName = interaction.user.globalName ?? interaction.user.username;
    const result = await refreshSharedCharacterTimer({
      baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
      demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
      viewerId,
      workspaceId: located.workspaceId,
      timerId,
      actorName,
    });
    if (!result.ok) {
      await interaction.followUp({
        content:
          result.error === 'timer_not_ready'
            ? 'Ten timer jeszcze trwa.'
            : `Nie udało się zapisać timera (${result.error}).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const panelConfig = getDailyCharacterTimerPanelConfig(result.workspaceId);
    const schedulerUser = panelConfig?.recipients[0] ?? interaction.user.id;
    cancelCharacterTimerReminder(schedulerUser, timerId);
    const readyAtMs = Date.parse(result.readyAtIso);
    if (Number.isFinite(readyAtMs)) {
      const refreshDeps = {
        logger: this.deps.logger,
        send: async () => {
          await refreshExistingDailyCharacterTimerPanels({
            config: this.deps.config,
            gateway: this.deps.gateway,
            logger: this.deps.logger,
            workspaceId: result.workspaceId,
          });
        },
      };
      const warningDelay = readyAtMs - Date.now() - 10 * 60_000;
      if (warningDelay > 5_000) {
        scheduleCharacterTimerReminder(
          {
            discordUserId: schedulerUser,
            timerId,
            label: `${result.label}:warning`,
            characterName: result.characterName,
            characterId: result.characterId,
            workspaceId: result.workspaceId,
            delayMs: warningDelay,
          },
          refreshDeps,
        );
      }
      const readyDelay = readyAtMs - Date.now();
      if (readyDelay > 5_000) {
        scheduleCharacterTimerReminder(
          {
            discordUserId: schedulerUser,
            timerId,
            label: `${result.label}:ready`,
            characterName: result.characterName,
            characterId: result.characterId,
            workspaceId: result.workspaceId,
            delayMs: readyDelay,
          },
          refreshDeps,
        );
      }
    }

    await refreshExistingDailyCharacterTimerPanels({
      config: this.deps.config,
      gateway: this.deps.gateway,
      logger: this.deps.logger,
      workspaceId: result.workspaceId,
    });
    await interaction.followUp({
      content: `Zapisano: **${result.label}**${result.characterName ? ` · ${result.characterName}` : ''}. Panel PW został odświeżony.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
