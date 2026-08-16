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
  isAllowedGuild,
} from '../../application/interactions/authorization.js';
import { claimInteractionId } from '../../application/interactions/idempotency.js';
import type { ActivityHttpClient } from '../../infrastructure/activity/activity-http-client.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import { safeErrorMessage } from '../../infrastructure/security/secret-redaction.js';
import {
  createSignedCustomId,
  panelPayload,
  parseSignedCustomId,
} from '../../infrastructure/security/signed-custom-id.js';
import {
  buildStatusEmbed,
  renderDeleteConfirmation,
  renderPanelMessage,
} from '../../presentation/discord/panel-renderer.js';
import { ActivityInteractionHandler } from './activity-interaction-handler.js';

export type InteractionRouterDeps = {
  config: DiscordGatewayConfig;
  gateway: DiscordJsGatewayAdapter;
  logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
  activityClient?: ActivityHttpClient | null;
};

export class InteractionRouter {
  private readonly secrets: string[];
  private readonly activityHandler: ActivityInteractionHandler | null;

  public constructor(private readonly deps: InteractionRouterDeps) {
    this.secrets = [deps.config.DISCORD_TOKEN, deps.config.DISCORD_COMPONENT_SIGNING_SECRET].filter(
      (value) => value.length > 0,
    );
    const activityClient = deps.activityClient ?? null;
    this.activityHandler =
      deps.config.DISCORD_ACTIVITY_ENABLED && activityClient !== null
        ? new ActivityInteractionHandler({
            config: deps.config,
            gateway: deps.gateway,
            activityClient,
            logger: deps.logger,
          })
        : null;
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
      if (!isAllowedGuild(interaction.guildId, this.deps.config.DISCORD_TEST_GUILD_ID)) {
        if (interaction.isRepliable()) {
          await interaction.reply({
            content: 'Ten bot działa wyłącznie na zatwierdzonym serwerze testowym V2.',
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

  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (this.activityHandler !== null) {
      const handled = await this.activityHandler.handleCommand(interaction);
      if (handled) {
        return;
      }
    }

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
    if (this.activityHandler !== null) {
      const handled = await this.activityHandler.handleComponent(interaction);
      if (handled) {
        return;
      }
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

  private async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    if (this.activityHandler !== null) {
      const handled = await this.activityHandler.handleModal(interaction);
      if (handled) {
        return;
      }
    }

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
