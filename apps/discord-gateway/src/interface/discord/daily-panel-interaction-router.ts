import { MessageFlags, type Interaction, type MessageComponentInteraction } from 'discord.js';

import {
  cancelCharacterTimerReminder,
  scheduleCharacterTimerReminder,
} from '../../application/notify/character-timer-reminders.js';
import {
  getDailyCharacterTimerPanelConfig,
  getDailyCharacterTimerPanelMessage,
} from '../../application/notify/daily-character-timer-panel-registry.js';
import {
  refreshExistingDailyCharacterTimerPanels,
  switchDailyCharacterTimerPanelCharacter,
  warsawClock,
} from '../../application/notify/daily-character-timer-panel-runtime.js';
import {
  currentKingdomWarPanelDayKey,
  getKingdomWarPanelMessage,
  replaceKingdomWarPanelSelectionForUser,
} from '../../application/notify/kingdom-war-panel-registry.js';
import { refreshKingdomWarPanels } from '../../application/notify/kingdom-war-panel-runtime.js';
import { resolveTeamKingdomWarWorkspaceId } from '../../application/notify/kingdom-war-team-recipients.js';
import { defaultBotConfigValues } from '../../application/technika/capabilities.js';
import { canonicalOwnerViewerId } from '../../infrastructure/player-team/owner-viewer-id.js';
import { readCharacterTimerCardFromBot } from '../../infrastructure/player-team/read-character-timer-card.js';
import { readSharedKingdomWarWorkspaceContext } from '../../infrastructure/player-team/read-team-workspace-context.js';
import { refreshSharedCharacterTimer } from '../../infrastructure/player-team/refresh-shared-character-timer.js';
import { parseCharacterTimerButtonCustomId } from '../../infrastructure/security/character-timer-custom-id.js';
import { parseCharacterTimerPanelSelectCustomId } from '../../infrastructure/security/character-timer-panel-custom-id.js';
import { parseSignedCustomId } from '../../infrastructure/security/signed-custom-id.js';
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
        const panel = getDailyCharacterTimerPanelMessage(selector.workspaceId, interaction.user.id);
        const today = warsawClock().dayKey;
        if (!panel || panel.dayKey !== today || panel.messageId !== interaction.message.id) {
          await interaction.reply({
            content: 'Ten panel timerów jest nieaktualny. Użyj dzisiejszej wiadomości PW.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
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
          dayKey: today,
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

      try {
        const parsed = parseSignedCustomId(
          interaction.customId,
          this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
        );
        if (parsed.action === 'war_claim' && parsed.payload.startsWith('wps')) {
          await this.handleKingdomWarSelection(interaction, parsed.payload.slice(3));
          return;
        }
      } catch {
        // not the new war selector
      }
    }

    if (interaction.isButton()) {
      try {
        const timerButton = parseCharacterTimerButtonCustomId(
          interaction.customId,
          this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
        );
        await this.handleCharacterTimerAction(
          interaction,
          timerButton.operation,
          timerButton.payload.timerId,
        );
        return;
      } catch {
        // not a character timer button
      }
    }

    await this.base.handle(interaction);
  }

  private async handleKingdomWarSelection(
    interaction: MessageComponentInteraction,
    scopeToken: string,
  ): Promise<void> {
    if (!interaction.isStringSelectMenu()) return;
    const workspaceId = resolveTeamKingdomWarWorkspaceId(scopeToken);
    if (!workspaceId) {
      await interaction.reply({
        content: 'Ten panel wojny jest nieaktualny.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const panel = getKingdomWarPanelMessage(workspaceId, interaction.user.id);
    const dayKey = currentKingdomWarPanelDayKey();
    if (!panel || panel.dayKey !== dayKey || panel.messageId !== interaction.message.id) {
      await interaction.reply({
        content: 'Ten panel wojny jest nieaktualny. Użyj bieżącej wiadomości PW.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferUpdate();
    const context = await readSharedKingdomWarWorkspaceContext({
      baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
      demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
      viewerId: interaction.user.id,
      workspaceId,
    });
    if (!context) {
      await interaction.followUp({
        content: 'Nie udało się potwierdzić członkostwa w tym zespole.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const allowed = new Set(context.roster.map((character) => character.id));
    const selected = interaction.values.filter((id) => allowed.has(id));
    if (selected.length !== interaction.values.length) {
      await interaction.followUp({
        content: 'Jedna z wybranych postaci nie należy już do tego zespołu.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const live = this.deps.getBotConfig?.() ?? defaultBotConfigValues();
    const warConfig = { ...live.kingdomWar, notifyMinutesBefore: 30 };
    const result = replaceKingdomWarPanelSelectionForUser({
      workspaceId,
      discordUserId: interaction.user.id,
      characterIds: selected,
      maxClaims: warConfig.maxClaimsPerUser,
    });
    if (!result.ok) {
      await interaction.followUp({
        content:
          result.reason === 'taken'
            ? 'Jedna z postaci została właśnie wybrana przez kogoś innego.'
            : `Możesz wybrać maksymalnie ${warConfig.maxClaimsPerUser} postaci.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const actorName = interaction.user.globalName ?? interaction.user.username;
    await refreshKingdomWarPanels({
      gateway: this.deps.gateway,
      discordConfig: this.deps.config,
      warConfig,
      context,
      logger: this.deps.logger,
      actorName,
      actorAction:
        selected.length > 0
          ? `wybrał(a) ${selected.length} ${selected.length === 1 ? 'postać' : 'postacie'}`
          : 'wyczyścił(a) swój wybór',
    });

    await interaction.followUp({
      content:
        selected.length > 0
          ? `Zapisano ${selected.length} ${selected.length === 1 ? 'postać' : 'postacie'} na wojnę. Skład został odświeżony całemu zespołowi.`
          : 'Wyczyszczono Twój wybór. Skład został odświeżony całemu zespołowi.',
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handleCharacterTimerAction(
    interaction: MessageComponentInteraction,
    operation: 'gotowe' | 'przypomnij',
    timerId: string,
  ): Promise<void> {
    if (operation === 'przypomnij') {
      await interaction.reply({
        content:
          'Ten stary typ przypomnienia został wyłączony. Aktualny stan jest utrzymywany w jednym dziennym panelu PW.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const viewerId = canonicalOwnerViewerId(interaction.user.id);
    const located = await readCharacterTimerCardFromBot({
      baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
      demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
      viewerId,
      timerId,
    });
    if (!located?.workspaceId) {
      await interaction.reply({
        content: 'Nie udało się odnaleźć timera w zespole.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const panel = getDailyCharacterTimerPanelMessage(located.workspaceId, interaction.user.id);
    const today = warsawClock().dayKey;
    if (!panel || panel.dayKey !== today || panel.messageId !== interaction.message.id) {
      await interaction.reply({
        content: 'Ten panel timerów jest nieaktualny. Użyj dzisiejszej wiadomości PW.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferUpdate();
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
