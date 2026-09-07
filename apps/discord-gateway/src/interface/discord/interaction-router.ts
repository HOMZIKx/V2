import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type Interaction,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { randomUUID } from 'node:crypto';

import {
  authorizePanelOperator,
  isAllowedInteractionContext,
} from '../../application/interactions/authorization.js';
import { claimInteractionId } from '../../application/interactions/idempotency.js';
import {
  cancelCharacterTimerReminder,
  scheduleCharacterTimerReminder,
} from '../../application/notify/character-timer-reminders.js';
import { claimKingdomWarCharacter } from '../../application/notify/kingdom-war-claims.js';
import { formatTimerNotifyContent } from '../../application/notify/notify-payload.js';
import {
  defaultBotConfigValues,
  type BotConfigValues,
} from '../../application/technika/capabilities.js';
import { evaluateGuildModuleGate } from '../../application/technika/guild-module-gate.js';
import { resolvePanelButtonMetaStore } from '../../application/technika/panel-button-meta.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import {
  confirmCharacterProgressTimerFromBot,
  snoozeCharacterProgressTimerFromBot,
} from '../../infrastructure/player-team/confirm-character-timer.js';
import { confirmTimerKillFromBot } from '../../infrastructure/player-team/confirm-timer-kill.js';
import { canonicalOwnerViewerId } from '../../infrastructure/player-team/owner-viewer-id.js';
import { parseCharacterTimerButtonCustomId } from '../../infrastructure/security/character-timer-custom-id.js';
import { safeErrorMessage } from '../../infrastructure/security/secret-redaction.js';
import {
  createSignedCustomId,
  HUB_CUSTOM_TO_ACTION,
  isHubAction,
  panelPayload,
  parseHubEphemButtonId,
  parseSignedCustomId,
} from '../../infrastructure/security/signed-custom-id.js';
import {
  isTimerButtonAction,
  isWarClaimAction,
  parseTimerButtonCustomId,
} from '../../infrastructure/security/timer-custom-id.js';
import {
  KINGDOM_WAR_CHARACTER_STUB,
  renderKingdomWarReminder,
} from '../../presentation/discord/kingdom-war-renderer.js';
import { HUB_ACTION_LABELS } from '../../presentation/discord/panel-publish-appearance.js';
import {
  buildStatusEmbed,
  renderDeleteConfirmation,
  renderPanelMessage,
} from '../../presentation/discord/panel-renderer.js';
import { renderTimerNotifyMessage } from '../../presentation/discord/timer-notify-renderer.js';

export type InteractionRouterDeps = {
  config: DiscordGatewayConfig;
  gateway: DiscordJsGatewayAdapter;
  logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
  getBotConfig?: () => BotConfigValues;
};

export class InteractionRouter {
  private readonly secrets: string[];

  public constructor(private readonly deps: InteractionRouterDeps) {
    this.secrets = [deps.config.DISCORD_TOKEN, deps.config.DISCORD_COMPONENT_SIGNING_SECRET].filter(
      (value) => value.length > 0,
    );
  }

  public async handle(interaction: Interaction): Promise<void> {
    const started = Date.now();
    if (!claimInteractionId(interaction.id)) {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'Ta interakcja jest już przetwarzana.',
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    try {
      const allowDm =
        interaction.isMessageComponent() || interaction.isModalSubmit()
          ? this.isDmAllowedComponent(interaction.customId)
          : false;

      if (
        !isAllowedInteractionContext({
          guildId: interaction.guildId,
          allowedGuildId: this.deps.config.DISCORD_TEST_GUILD_ID,
          allowDm,
        })
      ) {
        if (interaction.isRepliable()) {
          await interaction.reply({
            content: interaction.guildId
              ? 'Ten bot działa wyłącznie na zatwierdzonym serwerze testowym V2.'
              : 'Ta interakcja DM nie jest obsługiwana.',
            flags: MessageFlags.Ephemeral,
          });
        }
        return;
      }

      if (interaction.isChatInputCommand()) {
        await this.handleCommand(interaction);
        return;
      }

      if (interaction.isMessageComponent()) {
        await this.handleComponent(interaction);
        return;
      }

      if (interaction.isModalSubmit()) {
        await this.handleModal(interaction);
      }
    } catch (error) {
      this.deps.logger.error('Interaction failed', {
        interactionId: interaction.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        type: interaction.type,
        durationMs: Date.now() - started,
        error: safeErrorMessage(error, this.secrets),
      });
      if (interaction.isRepliable()) {
        const content =
          'Nie udało się obsłużyć interakcji. Spróbuj ponownie albo użyj `/panel-test`.';
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        }
      }
    } finally {
      this.deps.logger.info('Interaction handled', {
        interactionId: interaction.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        type: interaction.type,
        durationMs: Date.now() - started,
      });
    }
  }

  private isDmAllowedComponent(customId: string): boolean {
    try {
      const parsed = parseSignedCustomId(
        customId,
        this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      );
      return isTimerButtonAction(parsed.action) || isWarClaimAction(parsed.action);
    } catch {
      return false;
    }
  }

  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (interaction.commandName === 'status') {
      await this.handleStatus(interaction);
      return;
    }
    if (interaction.commandName === 'panel-test') {
      await this.handlePanelTest(interaction);
      return;
    }

    await interaction.reply({
      content: 'Nieznana komenda.',
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const snapshot = this.deps.gateway.getSnapshot();
    await interaction.editReply({
      embeds: [
        buildStatusEmbed({
          state: snapshot.state,
          guildId: this.deps.config.DISCORD_TEST_GUILD_ID,
          uptimeSeconds: snapshot.uptimeSeconds,
          pingMs: snapshot.pingMs,
          version: this.deps.config.APP_VERSION,
          commitSha: this.deps.config.GIT_COMMIT_SHA,
          commandsRegistered: snapshot.commandsRegistered,
        }),
      ],
    });
  }

  private async handlePanelTest(interaction: ChatInputCommandInteraction): Promise<void> {
    const auth = authorizePanelOperator({
      userId: interaction.user.id,
      operatorIds: this.deps.config.operatorIds,
      memberPermissionsBitfield: interaction.memberPermissions?.bitfield ?? null,
    });

    if (!auth.allowed) {
      await interaction.reply({
        content: 'Brak uprawnień. Wymagany operator testowy albo Manage Guild.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!interaction.channelId) {
      await interaction.reply({
        content: 'Nie można opublikować panelu poza kanałem tekstowym.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const permissions = await this.deps.gateway.checkChannelPermissions(
      this.deps.config.DISCORD_TEST_GUILD_ID,
      interaction.channelId,
    );
    if (!permissions.ok) {
      await interaction.reply({
        content: `Botowi brakuje uprawnień w tym kanale: ${permissions.missing.join(', ')}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const panel = renderPanelMessage({
      signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
    });

    if (
      !interaction.channel ||
      !interaction.channel.isTextBased() ||
      interaction.channel.isDMBased()
    ) {
      await interaction.editReply({
        content: 'Panel można opublikować tylko na kanale tekstowym serwera.',
      });
      return;
    }

    await interaction.channel.send(panel);
    await interaction.editReply({
      content: 'Panel testowy V2 LAB został opublikowany w tym kanale.',
    });
  }

  private async handleComponent(interaction: MessageComponentInteraction): Promise<void> {
    // Character progress timer buttons (Gotowe / Przypomnij później)
    try {
      const characterTimer = parseCharacterTimerButtonCustomId(
        interaction.customId,
        this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      );
      if (interaction.isButton()) {
        await this.handleCharacterTimerButton(
          interaction,
          characterTimer.operation,
          characterTimer.payload,
        );
        return;
      }
    } catch {
      // not a character timer button — fall through
    }

    // Legacy map-hunt timer buttons (not exposed in Technika)
    try {
      const timer = parseTimerButtonCustomId(
        interaction.customId,
        this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      );
      if (interaction.isButton()) {
        await this.handleTimerButton(interaction, timer.operation, timer.payload);
        return;
      }
    } catch {
      // not a timer button — fall through
    }

    let parsed;
    try {
      parsed = parseSignedCustomId(
        interaction.customId,
        this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      );
    } catch {
      await interaction.reply({
        content: 'Ten panel jest nieaktualny. Użyj `/panel-test`, aby opublikować nowy.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (isWarClaimAction(parsed.action) && interaction.isStringSelectMenu()) {
      await this.handleWarClaim(interaction);
      return;
    }

    if (isHubAction(parsed.action) && interaction.isButton()) {
      await this.handleHubButton(interaction, parsed.action, parsed.payload);
      return;
    }

    if (parsed.payload !== panelPayload() && !parsed.payload.startsWith(`${panelPayload()}m`)) {
      await interaction.reply({
        content: 'Ten panel jest nieaktualny. Użyj `/panel-test`, aby opublikować nowy.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (parsed.action === 'select' && interaction.isStringSelectMenu()) {
      const selected = interaction.values[0];
      if (selected === 'form_test') {
        const modal = new ModalBuilder()
          .setCustomId(
            createSignedCustomId(
              'modal',
              panelPayload(),
              this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
            ),
          )
          .setTitle('Formularz testowy V2 LAB')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('notes')
                .setLabel('Uwagi testowe')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(300),
            ),
          );
        await interaction.showModal(modal);
        return;
      }

      if (selected === 'system_status') {
        const snapshot = this.deps.gateway.getSnapshot();
        await interaction.reply({
          embeds: [
            buildStatusEmbed({
              state: snapshot.state,
              guildId: this.deps.config.DISCORD_TEST_GUILD_ID,
              uptimeSeconds: snapshot.uptimeSeconds,
              pingMs: snapshot.pingMs,
              version: this.deps.config.APP_VERSION,
              commitSha: this.deps.config.GIT_COMMIT_SHA,
              commandsRegistered: snapshot.commandsRegistered,
            }),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const correlationId = randomUUID();
      await interaction.reply({
        content: `Test odpowiedzi OK. Correlation ID: \`${correlationId}\``,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (parsed.action === 'refresh' && interaction.isButton()) {
      const auth = authorizePanelOperator({
        userId: interaction.user.id,
        operatorIds: this.deps.config.operatorIds,
        memberPermissionsBitfield: interaction.memberPermissions?.bitfield ?? null,
      });
      if (!auth.allowed) {
        await interaction.reply({
          content: 'Odświeżenie panelu wymaga uprawnień operatora albo Manage Guild.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const panel = renderPanelMessage({
        signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      });
      await interaction.update({
        content: null,
        embeds: [],
        components: panel.components ?? [],
        files: panel.files ?? [],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    if (parsed.action === 'delete_ask' && interaction.isButton()) {
      const auth = authorizePanelOperator({
        userId: interaction.user.id,
        operatorIds: this.deps.config.operatorIds,
        memberPermissionsBitfield: interaction.memberPermissions?.bitfield ?? null,
      });
      if (!auth.allowed) {
        await interaction.reply({
          content: 'Usunięcie panelu wymaga uprawnień operatora albo Manage Guild.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply(
        renderDeleteConfirmation(
          this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
          interaction.message.id,
        ),
      );
      return;
    }

    if (parsed.action === 'delete_cancel' && interaction.isButton()) {
      await interaction.update({
        content: 'Usuwanie anulowane.',
        components: [],
      });
      return;
    }

    if (parsed.action === 'delete_confirm' && interaction.isButton()) {
      const auth = authorizePanelOperator({
        userId: interaction.user.id,
        operatorIds: this.deps.config.operatorIds,
        memberPermissionsBitfield: interaction.memberPermissions?.bitfield ?? null,
      });
      if (!auth.allowed) {
        await interaction.reply({
          content: 'Usunięcie panelu wymaga uprawnień operatora albo Manage Guild.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const messageId = parsed.payload.slice(`${panelPayload()}m`.length);
      if (interaction.channel && interaction.channel.isTextBased() && messageId.length > 0) {
        try {
          await interaction.channel.messages.delete(messageId);
        } catch {
          // Panel may already be deleted.
        }
      }

      await interaction.update({
        content: 'Panel został usunięty.',
        components: [],
      });
      return;
    }

    await interaction.reply({
      content: 'Nieobsługiwana akcja komponentu.',
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handleHubButton(
    interaction: MessageComponentInteraction,
    action: import('../../infrastructure/security/signed-custom-id.js').ComponentAction,
    payload: string,
  ): Promise<void> {
    if (action === 'hub_ephem') {
      const buttonId = parseHubEphemButtonId(payload);
      const text =
        (buttonId ? resolvePanelButtonMetaStore().getEphemeral(buttonId) : null) ??
        'Brak tresci ephemeral dla tego przycisku.';
      await interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
      return;
    }

    const hubId = HUB_CUSTOM_TO_ACTION[action];
    const label =
      hubId && hubId in HUB_ACTION_LABELS
        ? HUB_ACTION_LABELS[hubId as keyof typeof HUB_ACTION_LABELS]
        : 'Akcja';

    const stubs: Record<string, string> = {
      create: '**Utworz aktywnosc** - formularz Centrum (ephemeral). Szkic handlera New Bot.',
      lfg: '**Szukam ekipy** - LFG (ephemeral). Handler gotowy.',
      mine: '**Moje aktywnosci** - prywatna lista (ephemeral). Handler gotowy.',
      notify: '**Powiadomienia** - skrzynka Centrum (ephemeral). Handler gotowy.',
      profile: '**Profil** - widok profilu (ephemeral). Handler gotowy.',
      forme: '**Dla mnie** - dopasowane aktywnosci (ephemeral). Handler gotowy.',
    };

    await interaction.reply({
      content: stubs[hubId ?? ''] ?? label + ' - akcja Centrum przyjeta.',
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handleCharacterTimerButton(
    interaction: MessageComponentInteraction,
    operation: 'gotowe' | 'przypomnij',
    payload: { timerId: string },
  ): Promise<void> {
    const live = this.deps.getBotConfig?.() ?? defaultBotConfigValues();
    const characterCfg = live.characterTimers ?? live.timersNotify;
    const guildGate = evaluateGuildModuleGate({
      config: live,
      guildId: interaction.guildId ?? this.deps.config.DISCORD_TEST_GUILD_ID,
      module: 'characterTimers',
      right: 'discord.notify',
    });
    if (!guildGate.allowed) {
      await interaction.reply({
        content: `Moduł timerów postaci jest wyłączony dla tej guildii (${guildGate.reason}).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (operation === 'przypomnij') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const minutes = characterCfg.reminderMinutesBefore;
      const actorName = interaction.user.globalName ?? interaction.user.username;
      const snooze = await snoozeCharacterProgressTimerFromBot({
        baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
        demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
        viewerId: canonicalOwnerViewerId(interaction.user.id),
        timerId: payload.timerId,
        actorName,
        reminderMinutesBefore: minutes,
      });
      if (!snooze.ok) {
        await interaction.editReply({
          content: `Nie udało się zapisać „Przypomnij później” (${snooze.error}). Sprawdź player-team albo kartę postaci w DESTILED.`,
        });
        return;
      }
      const who = snooze.characterName ? ` · ${snooze.characterName}` : '';
      const scheduledMinutes = snooze.reminderMinutesBefore;
      const delayMs = scheduledMinutes * 60_000;
      const scheduled = scheduleCharacterTimerReminder(
        {
          discordUserId: interaction.user.id,
          timerId: payload.timerId,
          label: snooze.label,
          characterName: snooze.characterName,
          characterId: snooze.characterId,
          delayMs,
        },
        {
          logger: this.deps.logger,
          send: async (job) => {
            const body = {
              discordUserId: job.discordUserId,
              title: `${job.label}${job.characterName ? ` · ${job.characterName}` : ''}`,
              body: `Przypomnienie: timer postaci kończy się / czeka na Ciebie. Oznacz Gotowe w Discord albo na karcie postaci.`,
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
              signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
              includeButtons: true,
            });
            await this.deps.gateway.sendTimerNotify({
              discordUserId: job.discordUserId,
              content: message.content ?? content,
              ...(message.components ? { components: message.components } : {}),
            });
          },
        },
      );
      const scheduleNote = scheduled.ok
        ? ` PW przypomnienia zapisane (~${minutes} min, przeżywa restart bota).`
        : '';
      await interaction.editReply({
        content: `Przypomnę ponownie za ok. ${minutes} min: **${snooze.label}**${who} (rewizja ${snooze.revision}).${scheduleNote} Bez otwierania WWW.`,
      });
      return;
    }

    // Update the DM in place so the LIVE 1..N list stays current after Gotowe.
    const canUpdateMessage =
      Boolean(interaction.message) &&
      interaction.message.author?.id === interaction.client.user?.id;
    if (canUpdateMessage) {
      await interaction.deferUpdate();
    } else {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    const actorName = interaction.user.globalName ?? interaction.user.username;
    // Canonical owner key = bare Discord snowflake (matches WWW viewer.id / x-demo-viewer-id).
    const result = await confirmCharacterProgressTimerFromBot({
      baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
      demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
      viewerId: canonicalOwnerViewerId(interaction.user.id),
      timerId: payload.timerId,
      actorName,
    });

    if (!result.ok) {
      const err = `Nie udało się oznaczyć timera postaci (${result.error}). Sprawdź player-team albo użyj karty postaci w DESTILED.`;
      if (canUpdateMessage) {
        await interaction.followUp({ content: err, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.editReply({ content: err });
      }
      return;
    }

    cancelCharacterTimerReminder(interaction.user.id, payload.timerId);

    const who = result.characterName ? ` · ${result.characterName}` : '';
    const ack = `Gotowe: **${result.label}**${who} (rewizja ${result.revision}). Bez otwierania WWW.`;

    if (canUpdateMessage && result.liveTimers.length > 0) {
      const deepLinkUrl = result.characterId
        ? `https://destiled.app/teams/team/characters/${encodeURIComponent(result.characterId)}?view=timers`
        : 'https://destiled.app/timers';
      const body = {
        discordUserId: interaction.user.id,
        title: result.characterName
          ? `Karta EQ · ${result.characterName}`
          : 'Karta EQ · timery postaci',
        body: `Zaktualizowano: **${result.label}**. Lista poniżej = LIVE timery TYLKO tej postaci.`,
        deepLinkUrl,
        timerId: payload.timerId,
        timerLabel: result.label,
        ...(result.characterId ? { characterId: result.characterId } : { workspaceId: 'team' }),
        ...(result.characterName ? { characterName: result.characterName } : {}),
        liveTimers: [...result.liveTimers],
        includeButtons: true,
        kind: 'manual' as const,
        actorName,
      };
      const content = formatTimerNotifyContent(body);
      const message = renderTimerNotifyMessage({
        payload: body,
        content,
        signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
        includeButtons: true,
      });
      await interaction.editReply({
        content: message.content ?? content,
        components: message.components ?? [],
      });
      await interaction.followUp({ content: ack, flags: MessageFlags.Ephemeral });
      return;
    }

    if (canUpdateMessage) {
      await interaction.followUp({ content: ack, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.editReply({ content: ack });
    }
  }

  private async handleTimerButton(
    interaction: MessageComponentInteraction,
    operation: 'zbite' | 'odloz',
    payload: { mapKey: string; channel: number; timerKey: string },
  ): Promise<void> {
    if (operation === 'odloz') {
      const minutes = (this.deps.getBotConfig?.() ?? defaultBotConfigValues()).timersNotify
        .reminderMinutesBefore;
      await interaction.reply({
        content: `Odłożono. Przypomnę ponownie za ok. ${minutes} min (szkielet przypomnienia — bez otwierania WWW).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const actorName = interaction.user.globalName ?? interaction.user.username;
    const result = await confirmTimerKillFromBot({
      baseUrl: this.deps.config.PLAYER_TEAM_BASE_URL,
      demoViewerHeader: this.deps.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
      viewerId: canonicalOwnerViewerId(interaction.user.id),
      mapKey: payload.mapKey,
      channel: payload.channel,
      timerKey: payload.timerKey,
      actorName,
    });

    if (!result.ok) {
      await interaction.editReply({
        content: `Nie udało się zapisać zbicia bez WWW (${result.error}). Sprawdź player-team albo użyj Timerów w DESTILED.`,
      });
      return;
    }

    await interaction.editReply({
      content: `Zapisano zbicie: **${payload.timerKey}** · ${payload.mapKey} CH${payload.channel} (rewizja ${result.revision}). Bez otwierania WWW.`,
    });
  }

  private async handleWarClaim(interaction: MessageComponentInteraction): Promise<void> {
    if (!interaction.isStringSelectMenu()) {
      await interaction.reply({
        content: 'Nieprawidłowa akcja wojny.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const characterId = interaction.values[0];
    if (!characterId) {
      await interaction.reply({
        content: 'Nie wybrano postaci.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const warCfg = (this.deps.getBotConfig?.() ?? defaultBotConfigValues()).kingdomWar;
    const result = claimKingdomWarCharacter({
      characterId,
      discordUserId: interaction.user.id,
      maxClaimsPerUser: warCfg.maxClaimsPerUser ?? 3,
    });
    if (!result.ok) {
      const content =
        result.reason === 'max_claims'
          ? `Limit claimów wojny: max ${warCfg.maxClaimsPerUser ?? 3} postaci na użytkownika.`
          : 'Ta postać jest już zajęta przez kogoś innego.';
      await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const cfg = (this.deps.getBotConfig?.() ?? defaultBotConfigValues()).kingdomWar;
    const character = KINGDOM_WAR_CHARACTER_STUB.find((c) => c.id === characterId);
    const updated = renderKingdomWarReminder({
      config: cfg,
      signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      claims: result.claims,
    });

    await interaction.update({
      content: updated.content ?? null,
      components: updated.components ?? [],
    });
    await interaction.followUp({
      content: `Zadeklarowano: **${character?.name ?? characterId}**. Inni widzą aktualny skład.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
      parseSignedCustomId(interaction.customId, this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET);
    } catch {
      await interaction.reply({
        content: 'Ten panel jest nieaktualny. Użyj `/panel-test`, aby opublikować nowy.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const notes = interaction.fields.getTextInputValue('notes');
    await interaction.reply({
      content: `Formularz przyjęty. Długość uwag: ${notes.length} znaków. Treść nie jest zapisywana ani logowana.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
