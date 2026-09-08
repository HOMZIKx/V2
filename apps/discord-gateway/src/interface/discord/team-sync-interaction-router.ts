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
import {
  readSharedWorkspaceTeamRecipients,
  readTeamWorkspaceContextFromBot,
} from '../../infrastructure/player-team/read-team-workspace-context.js';
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

function fallbackTeamRecipients(actorDiscordUserId: string): string[] {
  return [...new Set([...listKingdomWarRecipients(), actorDiscordUserId])];
}

function timerDeepLink(workspaceId: string | null, characterId: string | null): string {
  if (!workspaceId || !characterId) return 'https://desapp.zeabur.app/timers';
  return `https://desapp.zeabur.app/teams/${encodeURIComponent(workspaceId)}/characters/${encodeURIComponent(characterId)}?view=timers`;
}

function workspaceIdFromTimerMessage(content: string): string | null {
  const match = /\/teams\/([^/?#]+)\/characters\//.exec(content);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Team coordination layer around the legacy interaction router.
 * Character timer and war choices are team events: shared player-team state is the
 * source of truth, then the bot distributes the same snapshot to every team member.
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
      if (interaction.isButton()) {
        const workspaceHint = workspaceIdFromTimerMessage(interaction.message.content ?? '');
        if (characterTimer.operation === 'gotowe') {
          await this.handleCharacterTimerRefresh(
            interaction,
            characterTimer.payload.timerId,
            workspaceHint,
          );
          return;
        }
        if (characterTimer.operation === 'przypomnij') {
          await this.handleCharacterTimerSnooze(
            interaction,
            characterTimer.payload.timerId,
            workspaceHint,
          );
          return;
        }
      }
    } catch {
      // not a character-timer refresh; delegate or try war below
    }

    try {
      const parsed = parseSignedCustomId(
        interaction.customId,
        this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      );
      if (
        isWarClaimAction(parsed.action) &&
        (interaction.isButton() || interaction.isStringSelectMenu())
      ) {
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
    workspaceHint: string | null,
  ): Promise<void> {
    const actorName = interaction.user.globalName ?? interaction.user.username;
    const ownerViewerId = canonicalOwnerViewerId(interaction.user.id);

    const locatedFromShared = workspaceHint
      ? await readSharedCharacterTimerCardFromBot({
          baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
          demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
          viewerId: ownerViewerId,
          workspaceId: workspaceHint,
          timerId,
        })
      : null;
    const located =
      locatedFromShared ??
      (await readCharacterTimerCardFromBot({
        baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
        demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
        viewerId: ownerViewerId,
        timerId,
      }));
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
    const sharedRecipients = await readSharedWorkspaceTeamRecipients({
      baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
      demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
      viewerId: interaction.user.id,
      workspaceId,
    });
    const recipients =
      sharedRecipients.length > 0
        ? [...new Set([...sharedRecipients, interaction.user.id])]
        : fallbackTeamRecipients(interaction.user.id);

    for (const discordUserId of recipients) {
      cancelCharacterTimerReminder(discordUserId, timerId);
    }
    const readyAtMs = Date.parse(result.readyAtIso);
    const delayMs = Number.isFinite(readyAtMs)
      ? Math.max(5_000, readyAtMs - Date.now())
      : 60 * 60_000;
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

  private async handleCharacterTimerSnooze(
    interaction: MessageComponentInteraction,
    timerId: string,
    workspaceHint: string | null,
  ): Promise<void> {
    const ownerViewerId = canonicalOwnerViewerId(interaction.user.id);
    const locatedFromShared = workspaceHint
      ? await readSharedCharacterTimerCardFromBot({
          baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
          demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
          viewerId: ownerViewerId,
          workspaceId: workspaceHint,
          timerId,
        })
      : null;
    const located =
      locatedFromShared ??
      (await readCharacterTimerCardFromBot({
        baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
        demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
        viewerId: ownerViewerId,
        timerId,
      }));

    if (!located?.workspaceId) {
      await interaction.reply({
        content: 'Nie udało się odnaleźć wspólnej karty tego timera.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const live = this.deps.getBotConfig?.() ?? defaultBotConfigValues();
    const characterCfg = live.characterTimers ?? live.timersNotify;
    const minutes = Math.max(
      1,
      Math.min(1440, Math.round(characterCfg.reminderMinutesBefore || 60)),
    );
    const deepLinkUrl = timerDeepLink(located.workspaceId, located.characterId);
    const delayMs = minutes * 60_000;
    const scheduled = scheduleCharacterTimerReminder(
      {
        discordUserId: interaction.user.id,
        timerId,
        label: located.timerLabel,
        characterName: located.characterName,
        characterId: located.characterId,
        workspaceId: located.workspaceId,
        deepLinkUrl,
        delayMs,
      },
      {
        logger: this.deps.logger,
        send: (job) => this.sendSnoozedTimerCard(job),
      },
    );

    const who = located.characterName ? ` · ${located.characterName}` : '';
    await interaction.reply({
      content: scheduled.ok
        ? `Przypomnę ponownie za ok. ${minutes} min: **${located.timerLabel}**${who}.`
        : `Nie udało się zapisać przypomnienia: **${located.timerLabel}**${who}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  private async sendSnoozedTimerCard(job: CharacterTimerReminderJob): Promise<void> {
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
    const resolvedWorkspaceId = card?.workspaceId ?? job.workspaceId;
    const resolvedCharacterId = card?.characterId ?? job.characterId;
    const resolvedCharacterName = card?.characterName ?? job.characterName;
    const focus = card?.liveTimers.find((timer) => timer.id === job.timerId);
    const deepLinkUrl = job.deepLinkUrl ?? timerDeepLink(resolvedWorkspaceId, resolvedCharacterId);
    const payload: TimerNotifyPayload = {
      discordUserId: job.discordUserId,
      title: `${job.label}${resolvedCharacterName ? ` · ${resolvedCharacterName}` : ''}`,
      body: 'Przypomnienie. Poniżej aktualny stan wszystkich timerów tej postaci.',
      deepLinkUrl,
      ...(resolvedWorkspaceId ? { workspaceId: resolvedWorkspaceId } : {}),
      ...(resolvedCharacterId ? { characterId: resolvedCharacterId } : {}),
      ...(resolvedCharacterName ? { characterName: resolvedCharacterName } : {}),
      timerId: job.timerId,
      timerLabel: job.label,
      ...(focus?.readyAtIso ? { endsAt: focus.readyAtIso } : {}),
      ...(card?.liveTimers ? { liveTimers: [...card.liveTimers] } : {}),
      includeButtons: Boolean(card),
      kind: 'reminder',
    };
    const content = formatTimerNotifyContent(payload);
    const message = renderTimerNotifyMessage({
      payload,
      content,
      signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      includeButtons: Boolean(card),
    });
    await this.deps.gateway.sendTimerNotify({
      discordUserId: job.discordUserId,
      content: message.content ?? content,
      ...(message.components ? { components: message.components } : {}),
    });
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
      job.deepLinkUrl ??
      timerDeepLink(card?.workspaceId ?? job.workspaceId, card?.characterId ?? job.characterId);
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

    const context = await readTeamWorkspaceContextFromBot({
      baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
      demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
      viewerId: interaction.user.id,
    });
    const roster = context?.roster.length ? context.roster : [...KINGDOM_WAR_CHARACTER_STUB];
    const characterName =
      roster.find((character) => character.id === characterId)?.name ?? characterId;
    const actorName = interaction.user.globalName ?? interaction.user.username;
    const panel = renderKingdomWarReminder({
      config: cfg,
      signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      claims: getKingdomWarClaims(),
      roster,
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

    const recipients = context?.recipients.length
      ? [...new Set([...context.recipients, interaction.user.id])]
      : fallbackTeamRecipients(interaction.user.id);
    for (const discordUserId of recipients) {
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
