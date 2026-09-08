import { MessageFlags, type Interaction, type MessageComponentInteraction } from 'discord.js';

import {
  cancelCharacterTimerReminder,
  scheduleCharacterTimerReminder,
  type CharacterTimerReminderJob,
} from '../../application/notify/character-timer-reminders.js';
import {
  claimKingdomWarCharacter,
  getKingdomWarClaims,
} from '../../application/notify/kingdom-war-claims.js';
import { listKingdomWarRecipients } from '../../application/notify/kingdom-war-recipients.js';
import {
  formatTimerNotifyContent,
  type TimerNotifyPayload,
} from '../../application/notify/notify-payload.js';
import { defaultBotConfigValues } from '../../application/technika/capabilities.js';
import { markCharacterTimerReadyInWorkspace } from '../../infrastructure/player-team/mark-character-timer-ready.js';
import { canonicalOwnerViewerId } from '../../infrastructure/player-team/owner-viewer-id.js';
import {
  readCharacterTimerCardFromBot,
  readSharedCharacterTimerCardFromBot,
} from '../../infrastructure/player-team/read-character-timer-card.js';
import { refreshSharedCharacterTimer } from '../../infrastructure/player-team/refresh-shared-character-timer.js';
import { parseCharacterTimerButtonCustomId } from '../../infrastructure/security/character-timer-custom-id.js';
import { parseSignedCustomId } from '../../infrastructure/security/signed-custom-id.js';
import { isWarClaimAction } from '../../infrastructure/security/timer-custom-id.js';
import {
  KINGDOM_WAR_CHARACTER_STUB,
  renderKingdomWarReminder,
} from '../../presentation/discord/kingdom-war-renderer.js';
import { renderTimerNotifyMessage } from '../../presentation/discord/timer-notify-renderer.js';
import { InteractionRouter, type InteractionRouterDeps } from './interaction-router.js';

function teamRecipients(actorDiscordUserId: string): string[] {
  return [...new Set([...listKingdomWarRecipients(), actorDiscordUserId])];
}

function timerDeepLink(workspaceId: string | null, characterId: string | null): string {
  if (!workspaceId || !characterId) return 'https://desapp.zeabur.app/timers';
  return `https://desapp.zeabur.app/teams/${encodeURIComponent(workspaceId)}/characters/${encodeURIComponent(characterId)}?view=timers`;
}

/**
 * Team coordination layer around the legacy interaction router.
 * Character timer and war choices are team events: the shared state changes once,
 * then the bot distributes the same current snapshot to the rest of the team.
 */
export class TeamSyncInteractionRouter {
  private readonly base: InteractionRouter;

  public constructor(private readonly deps: InteractionRouterDeps) {
    this.base = new InteractionRouter(deps);
  }

  public async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isMessageComponent()) {
      await this.base.handle(interaction);
      return;
    }

    try {
      const characterTimer = parseCharacterTimerButtonCustomId(
        interaction.customId,
        this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      );
      if (interaction.isButton() && characterTimer.operation === 'gotowe') {
        await this.handleCharacterTimerRefresh(interaction, characterTimer.payload.timerId);
        return;
      }
    } catch {
      // not a character-timer refresh; delegate or try war below
    }

    try {
      const parsed = parseSignedCustomId(
        interaction.customId,
        this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      );
      if (isWarClaimAction(parsed.action) && (interaction.isButton() || interaction.isStringSelectMenu())) {
        const characterId = interaction.isStringSelectMenu()
          ? interaction.values[0]
          : parsed.payload;
        if (characterId) {
          await this.handleWarClaim(interaction, characterId);
          return;
        }
      }
    } catch {
      // not a war action
    }

    await this.base.handle(interaction);
  }

  private async handleCharacterTimerRefresh(
    interaction: MessageComponentInteraction,
    timerId: string,
  ): Promise<void> {
    const actorName = interaction.user.globalName ?? interaction.user.username;
    const ownerViewerId = canonicalOwnerViewerId(interaction.user.id);

    // Personal state is used only to locate the workspace. The actual mutation below
    // is always a shared-workspace PUT, which is what every web client subscribes to.
    const located = await readCharacterTimerCardFromBot({
      baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
      demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
      viewerId: ownerViewerId,
      timerId,
    });
    if (!located?.workspaceId) {
      await interaction.reply({
        content: 'Nie udało się odnaleźć wspólnej karty tego timera.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = await refreshSharedCharacterTimer({
      baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
      demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
      viewerId: ownerViewerId,
      workspaceId: located.workspaceId,
      timerId,
      actorName,
    });

    if (!result.ok) {
      const message =
        result.error === 'timer_not_ready'
          ? 'Ten timer jest nadal zablokowany. Odświeżenie będzie możliwe dopiero po jego zakończeniu.'
          : `Nie udało się odświeżyć timera (${result.error}).`;
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      return;
    }

    const liveTimers = result.liveTimers;
    const workspaceId = result.workspaceId;
    const characterId = result.characterId;
    const characterName = result.characterName;
    const deepLinkUrl = timerDeepLink(workspaceId, characterId);
    const recipients = teamRecipients(interaction.user.id);

    // Refresh starts a new cycle. Remove stale due/snooze jobs and arm the next due
    // event for every team recipient.
    for (const discordUserId of recipients) {
      cancelCharacterTimerReminder(discordUserId, timerId);
    }
    const readyAtMs = Date.parse(result.readyAtIso);
    const delayMs = Number.isFinite(readyAtMs) ? Math.max(5_000, readyAtMs - Date.now()) : 60 * 60_000;
    for (const discordUserId of recipients) {
      scheduleCharacterTimerReminder(
        {
          discordUserId,
          timerId,
          label: result.label,
          characterName,
          characterId,
          workspaceId,
          deepLinkUrl,
          delayMs,
        },
        {
          logger: this.deps.logger,
          // The startup worker is the canonical sender; this callback is only a
          // fallback before bootstrap has installed it.
          send: (job) => this.sendDueTimerCard(job),
        },
      );
    }

    const payloadFor = (discordUserId: string): TimerNotifyPayload => ({
      discordUserId,
      title: `${result.label}${characterName ? ` · ${characterName}` : ''}`,
      body: `${actorName} odświeżył timer. Cały zespół ma poniżej ten sam aktualny stan karty.`,
      deepLinkUrl,
      workspaceId,
      ...(characterId ? { characterId } : {}),
      ...(characterName ? { characterName } : {}),
      timerId,
      timerLabel: result.label,
      endsAt: result.readyAtIso,
      liveTimers: [...liveTimers],
      includeButtons: true,
      kind: 'reset',
      actorName,
    });

    const actorPayload = payloadFor(interaction.user.id);
    const actorContent = formatTimerNotifyContent(actorPayload);
    const actorMessage = renderTimerNotifyMessage({
      payload: actorPayload,
      content: actorContent,
      signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      includeButtons: true,
    });

    if (interaction.message.author?.id === interaction.client.user?.id) {
      await interaction.update({
        content: actorMessage.content ?? actorContent,
        components: actorMessage.components ?? [],
      });
    } else {
      await interaction.reply({
        content: `Odświeżono: ${result.label}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    for (const discordUserId of recipients) {
      if (discordUserId === interaction.user.id) continue;
      const payload = payloadFor(discordUserId);
      const content = formatTimerNotifyContent(payload);
      const message = renderTimerNotifyMessage({
        payload,
        content,
        signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
        includeButtons: true,
      });
      try {
        await this.deps.gateway.sendTimerNotify({
          discordUserId,
          content: message.content ?? content,
          ...(message.components ? { components: message.components } : {}),
        });
      } catch (error) {
        this.deps.logger.warn('Team timer refresh DM failed', {
          discordUserId,
          timerId,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
  }

  private async sendDueTimerCard(job: CharacterTimerReminderJob): Promise<void> {
    if (job.workspaceId) {
      await markCharacterTimerReadyInWorkspace({
        baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
        demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
        viewerId: job.discordUserId,
        workspaceId: job.workspaceId,
        timerId: job.timerId,
      }).catch(() => false);
    }

    const card = job.workspaceId
      ? await readSharedCharacterTimerCardFromBot({
          baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
          demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
          viewerId: job.discordUserId,
          workspaceId: job.workspaceId,
          timerId: job.timerId,
        })
      : await readCharacterTimerCardFromBot({
          baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
          demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
          viewerId: job.discordUserId,
          timerId: job.timerId,
        });
    const deepLinkUrl =
      job.deepLinkUrl ?? timerDeepLink(card?.workspaceId ?? job.workspaceId, card?.characterId ?? job.characterId);
    const resolvedWorkspaceId = card?.workspaceId ?? job.workspaceId;
    const resolvedCharacterId = card?.characterId ?? job.characterId;
    const resolvedCharacterName = card?.characterName ?? job.characterName;
    const payload: TimerNotifyPayload = {
      discordUserId: job.discordUserId,
      title: `${job.label}${resolvedCharacterName ? ` · ${resolvedCharacterName}` : ''}`,
      body: 'Timer jest gotowy, ale pozostaje zablokowany do jawnego odświeżenia przez zespół.',
      deepLinkUrl,
      ...(resolvedWorkspaceId ? { workspaceId: resolvedWorkspaceId } : {}),
      ...(resolvedCharacterId ? { characterId: resolvedCharacterId } : {}),
      ...(resolvedCharacterName ? { characterName: resolvedCharacterName } : {}),
      timerId: job.timerId,
      timerLabel: job.label,
      endsAt: new Date(job.fireAtMs).toISOString(),
      ...(card?.liveTimers ? { liveTimers: [...card.liveTimers] } : {}),
      includeButtons: true,
      kind: 'reminder',
    };
    const content = formatTimerNotifyContent(payload);
    const message = renderTimerNotifyMessage({
      payload,
      content,
      signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      includeButtons: true,
    });
    await this.deps.gateway.sendTimerNotify({
      discordUserId: job.discordUserId,
      content: message.content ?? content,
      ...(message.components ? { components: message.components } : {}),
    });
  }

  private async handleWarClaim(
    interaction: MessageComponentInteraction,
    characterId: string,
  ): Promise<void> {
    const cfg = (this.deps.getBotConfig?.() ?? defaultBotConfigValues()).kingdomWar;
    const result = claimKingdomWarCharacter({
      characterId,
      discordUserId: interaction.user.id,
      maxClaimsPerUser: cfg.maxClaimsPerUser ?? 3,
    });
    if (!result.ok) {
      const content =
        result.reason === 'max_claims'
          ? `Limit wyborów: max ${cfg.maxClaimsPerUser ?? 3} postaci na użytkownika.`
          : 'Ta postać została już wybrana przez inną osobę.';
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      return;
    }

    const characterName =
      KINGDOM_WAR_CHARACTER_STUB.find((character) => character.id === characterId)?.name ?? characterId;
    const actorName = interaction.user.globalName ?? interaction.user.username;
    const panel = renderKingdomWarReminder({
      config: cfg,
      signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      claims: getKingdomWarClaims(),
      actorName,
      actorAction: `wybrał postać **${characterName}**`,
    });

    if (interaction.message.author?.id === interaction.client.user?.id) {
      await interaction.update({
        content: panel.content ?? '',
        components: panel.components ?? [],
      });
    } else {
      await interaction.reply({
        content: `Wybrano: ${characterName}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    for (const discordUserId of teamRecipients(interaction.user.id)) {
      if (discordUserId === interaction.user.id) continue;
      try {
        await this.deps.gateway.sendTimerNotify({
          discordUserId,
          content: panel.content ?? '**DESTILED · Wojna królestw**',
          ...(panel.components ? { components: panel.components } : {}),
        });
      } catch (error) {
        this.deps.logger.warn('Team kingdom-war claim DM failed', {
          discordUserId,
          characterId,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
  }
}
