/**
 * Activity Centrum interaction handlers (P4.2 product UX pass).
 * Business rules stay in activity-service; gateway maps Discord ↔ HTTP.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { createHash, randomUUID } from 'node:crypto';

import { authorizePanelOperator } from '../../application/interactions/authorization.js';
import {
  ActivityHttpError,
  type ActivityHttpClient,
} from '../../infrastructure/activity/activity-http-client.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import {
  createEventCustomId,
  isActivityCustomId,
  parseActivityCustomId,
  type ParsedActivityCustomId,
} from '../../infrastructure/security/activity-signed-custom-id.js';
import {
  renderDraftFormSummary,
  renderInboxList,
} from '../../presentation/discord/activity-ephemeral-renderer.js';
import { renderActivityHubMessage } from '../../presentation/discord/activity-hub-renderer.js';
import { toUserFacingError } from '../../presentation/discord/activity-user-errors.js';
import { toComponentsV2Payload } from '../../presentation/discord/components-v2-payload.js';
import {
  formatPolishLocalDateTime,
  parsePolishLocalDateTime,
} from '../../presentation/discord/localized-datetime.js';

export type ActivityInteractionDeps = {
  config: DiscordGatewayConfig;
  gateway: DiscordJsGatewayAdapter;
  activityClient: ActivityHttpClient;
  logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
};

function actorOf(userId: string) {
  return { discordUserId: userId };
}

function idem(userId: string, op: string, scope: string): string {
  return createHash('sha256').update(`${userId}:${op}:${scope}`).digest('hex').slice(0, 32);
}

function opaqueFromUuid(id: string): string {
  return id.replace(/-/g, '').toLowerCase().slice(0, 12);
}

function isOperator(
  interaction: {
    user: { id: string };
    memberPermissions?: { bitfield?: bigint | null } | null;
  },
  config: DiscordGatewayConfig,
): boolean {
  return authorizePanelOperator({
    userId: interaction.user.id,
    operatorIds: config.operatorIds,
    memberPermissionsBitfield: interaction.memberPermissions?.bitfield ?? null,
  }).allowed;
}

function draftPayload(draft: { payload?: Record<string, unknown> }): Record<string, unknown> {
  return draft.payload ?? {};
}

function draftSummaryLines(payload: Record<string, unknown>): string[] {
  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name : '—';
  const description =
    typeof payload.description === 'string' && payload.description.trim()
      ? payload.description.trim().slice(0, 180)
      : '—';
  let when = '—';
  if (typeof payload.startAt === 'string' && payload.startAt.length > 0) {
    const parsed = new Date(payload.startAt);
    when = Number.isNaN(parsed.getTime()) ? '—' : formatPolishLocalDateTime(parsed);
  } else if (typeof payload.startAtDisplay === 'string') {
    when = payload.startAtDisplay;
  }
  return [
    `**Nazwa:** ${name}`,
    `**Data i godzina:** ${when}`,
    `**Opis:** ${description}`,
    '',
    'Edytuj sekcje w dowolnej kolejności, potem użyj Podgląd lub Publikuj.',
  ];
}

export class ActivityInteractionHandler {
  public constructor(private readonly deps: ActivityInteractionDeps) {}

  public isActivityComponent(customId: string): boolean {
    return isActivityCustomId(customId);
  }

  public async handleCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
    if (!this.deps.config.DISCORD_ACTIVITY_ENABLED) {
      return false;
    }
    switch (interaction.commandName) {
      case 'centrum-panel':
        await this.publishHub(interaction);
        return true;
      case 'centrum-status':
        await this.hubStatus(interaction);
        return true;
      case 'centrum-reconcile':
        await this.reconcileHub(interaction);
        return true;
      case 'centrum-seed':
        await this.seedGuild(interaction);
        return true;
      default:
        return false;
    }
  }

  public async handleComponent(interaction: MessageComponentInteraction): Promise<boolean> {
    if (!this.deps.config.DISCORD_ACTIVITY_ENABLED) {
      return false;
    }
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
      return false;
    }
    if (!isActivityCustomId(interaction.customId)) {
      return false;
    }

    let parsed: ParsedActivityCustomId;
    try {
      parsed = parseActivityCustomId(
        interaction.customId,
        this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      );
    } catch {
      await interaction.reply({
        content: 'Ta interakcja jest nieprawidłowa lub wygasła. Odśwież panel Centrum.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (parsed.scope === 'panel' && (parsed.action === 'create' || parsed.action === 'lfg')) {
      await this.openCreateOrLfg(interaction, parsed);
      return true;
    }

    if (parsed.scope === 'draft' && parsed.action.startsWith('section_')) {
      await this.openDraftSectionModal(interaction, parsed);
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (parsed.scope === 'panel') {
        await this.handlePanelAction(interaction, parsed);
        return true;
      }
      if (parsed.scope === 'event') {
        await this.handleEventAction(interaction, parsed);
        return true;
      }
      if (parsed.scope === 'draft') {
        await this.handleDraftAction(interaction, parsed);
        return true;
      }
    } catch (error) {
      this.deps.logger.error('Centrum component failed', {
        error: error instanceof Error ? error.message : String(error),
        status: error instanceof ActivityHttpError ? error.status : undefined,
        body: error instanceof ActivityHttpError ? error.body?.slice(0, 300) : undefined,
      });
      await interaction.editReply({ content: toUserFacingError(error) });
      return true;
    }

    return true;
  }

  public async handleModal(interaction: ModalSubmitInteraction): Promise<boolean> {
    if (!this.deps.config.DISCORD_ACTIVITY_ENABLED) {
      return false;
    }
    if (!interaction.customId.startsWith('activity:v1:modal:')) {
      return false;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const parts = interaction.customId.split(':');
    const kind = parts[3];
    const draftId = parts[4];

    try {
      if (kind === 'basics' && draftId !== undefined) {
        const name = interaction.fields.getTextInputValue('name');
        const description = interaction.fields.getTextInputValue('description');
        const draft = await this.deps.activityClient.updateDraft(
          draftId,
          { payload: { name, description } },
          {
            ...actorOf(interaction.user.id),
            idempotencyKey: idem(interaction.user.id, 'draft-update', draftId),
          },
        );
        await interaction.editReply(
          renderDraftFormSummary({
            opaqueDraftId: opaqueFromUuid(draft.id),
            signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
            title: 'Szkic aktywności',
            lines: draftSummaryLines(draftPayload(draft)),
          }),
        );
        return true;
      }

      if (kind === 'schedule' && draftId !== undefined) {
        const rawWhen = interaction.fields.getTextInputValue('when');
        const startAt = parsePolishLocalDateTime(rawWhen);
        const draft = await this.deps.activityClient.updateDraft(
          draftId,
          {
            payload: {
              startAt: startAt.toISOString(),
              startAtDisplay: formatPolishLocalDateTime(startAt),
            },
          },
          {
            ...actorOf(interaction.user.id),
            idempotencyKey: idem(interaction.user.id, 'draft-schedule', draftId),
          },
        );
        await interaction.editReply(
          renderDraftFormSummary({
            opaqueDraftId: opaqueFromUuid(draft.id),
            signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
            title: 'Szkic aktywności',
            lines: draftSummaryLines(draftPayload(draft)),
          }),
        );
        return true;
      }

      if (kind === 'lfg' && draftId !== undefined) {
        const name = interaction.fields.getTextInputValue('name');
        const rawWhen = interaction.fields.getTextInputValue('when');
        const startAt = parsePolishLocalDateTime(rawWhen);
        await this.deps.activityClient.updateDraft(
          draftId,
          {
            payload: {
              name,
              startAt: startAt.toISOString(),
              startAtDisplay: formatPolishLocalDateTime(startAt),
              lfg: true,
            },
          },
          {
            ...actorOf(interaction.user.id),
            idempotencyKey: idem(interaction.user.id, 'draft-update', draftId),
          },
        );
        const published = await this.deps.activityClient.publishDraft(
          draftId,
          {
            organizationId: this.deps.config.ACTIVITY_ORGANIZATION_ID,
            name,
            startAt: startAt.toISOString(),
            ...(interaction.channelId !== null
              ? { publicationChannelId: interaction.channelId }
              : {}),
          },
          {
            ...actorOf(interaction.user.id),
            idempotencyKey: idem(interaction.user.id, 'draft-publish', draftId),
          },
        );
        await interaction.editReply({
          content: `Opublikowano „Szukam ekipy”: **${String(published.name ?? name)}**.`,
        });
        return true;
      }

      if (kind === 'report') {
        const activityId = parts[4];
        const reason = interaction.fields.getTextInputValue('reason');
        const details = interaction.fields.getTextInputValue('details');
        if (activityId !== undefined) {
          await this.deps.activityClient.createReport(
            activityId,
            { reasonCategory: reason, details },
            {
              ...actorOf(interaction.user.id),
              idempotencyKey: idem(interaction.user.id, 'report', `${activityId}:${reason}`),
            },
          );
          await interaction.editReply({ content: 'Zgłoszenie zapisane. Dziękujemy.' });
        }
        return true;
      }

      await interaction.editReply({ content: 'Nieobsługiwany formularz Centrum.' });
      return true;
    } catch (error) {
      this.deps.logger.error('Centrum modal failed', {
        error: error instanceof Error ? error.message : String(error),
        status: error instanceof ActivityHttpError ? error.status : undefined,
        body: error instanceof ActivityHttpError ? error.body?.slice(0, 300) : undefined,
      });
      await interaction.editReply({ content: toUserFacingError(error) });
      return true;
    }
  }

  private async openCreateOrLfg(
    interaction: MessageComponentInteraction,
    parsed: Extract<ParsedActivityCustomId, { scope: 'panel' }>,
  ): Promise<void> {
    const guildId = interaction.guildId ?? this.deps.config.DISCORD_TEST_GUILD_ID;
    try {
      const draft = await this.deps.activityClient.createDraft(
        { guildId, payload: { source: parsed.action, panelOpaqueId: parsed.opaqueId } },
        {
          ...actorOf(interaction.user.id),
          idempotencyKey: idem(
            interaction.user.id,
            'draft-create',
            `${guildId}:${parsed.action}:${interaction.id}`,
          ),
        },
      );

      if (parsed.action === 'lfg') {
        const modal = new ModalBuilder()
          .setCustomId(`activity:v1:modal:lfg:${draft.id}`)
          .setTitle('Szukam ekipy');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('name')
              .setLabel('Nazwa')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(100),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('when')
              .setLabel('Data i godzina (np. 20.08.2026 18:00)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(32)
              .setPlaceholder('DD.MM.RRRR GG:MM'),
          ),
        );
        await interaction.showModal(modal);
        return;
      }

      await interaction.reply(
        renderDraftFormSummary({
          opaqueDraftId: opaqueFromUuid(draft.id),
          signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
          title: 'Szkic aktywności',
          lines: draftSummaryLines(draftPayload(draft)),
        }),
      );
    } catch (error) {
      this.deps.logger.error('Centrum create/lfg open failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      const content = toUserFacingError(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
    }
  }

  private async openDraftSectionModal(
    interaction: MessageComponentInteraction,
    parsed: Extract<ParsedActivityCustomId, { scope: 'draft' }>,
  ): Promise<void> {
    try {
      const draft = await this.deps.activityClient.lookupDraftByOpaque(
        parsed.opaqueId,
        actorOf(interaction.user.id),
      );
      const payload = draftPayload(draft);

      if (parsed.action === 'section_basics') {
        const modal = new ModalBuilder()
          .setCustomId(`activity:v1:modal:basics:${draft.id}`)
          .setTitle('Nazwa i opis');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('name')
              .setLabel('Nazwa')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(100)
              .setValue(typeof payload.name === 'string' ? payload.name.slice(0, 100) : ''),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('description')
              .setLabel('Opis')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(1000)
              .setValue(
                typeof payload.description === 'string' ? payload.description.slice(0, 1000) : '',
              ),
          ),
        );
        await interaction.showModal(modal);
        return;
      }

      if (parsed.action === 'section_schedule') {
        const modal = new ModalBuilder()
          .setCustomId(`activity:v1:modal:schedule:${draft.id}`)
          .setTitle('Data i godzina');
        const preset =
          typeof payload.startAtDisplay === 'string'
            ? payload.startAtDisplay
            : typeof payload.startAt === 'string'
              ? formatPolishLocalDateTime(new Date(payload.startAt))
              : '';
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('when')
              .setLabel('Data i godzina (np. 20.08.2026 18:00)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(32)
              .setPlaceholder('DD.MM.RRRR GG:MM')
              .setValue(preset.slice(0, 32)),
          ),
        );
        await interaction.showModal(modal);
        return;
      }

      await interaction.reply({
        content: 'Ta sekcja nie jest jeszcze dostępna w tym widoku.',
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      this.deps.logger.error('Centrum draft section modal failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      await interaction.reply({
        content: toUserFacingError(error),
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  private async publishHub(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!isOperator(interaction, this.deps.config)) {
      await interaction.reply({
        content: 'Tylko operatorzy testowi mogą publikować panel Centrum.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!interaction.channelId) {
      await interaction.reply({
        content: 'Centrum można opublikować tylko na kanale tekstowym.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channelId = interaction.channelId;
    const guildId = interaction.guildId ?? this.deps.config.DISCORD_TEST_GUILD_ID;
    const actor = actorOf(interaction.user.id);

    const existing = await this.deps.activityClient.listPanels(guildId, actor);
    const hub = existing.find((p) => {
      const row = p as { panelType?: string; channelId?: string };
      return (
        (row.panelType === 'hub' || row.panelType === undefined) &&
        (row.channelId === undefined || row.channelId === channelId)
      );
    });

    const operationId = randomUUID();
    const nonce = operationId.replace(/-/g, '').slice(0, 25);

    const panel = await this.deps.activityClient.upsertPanel(
      {
        organizationId: this.deps.config.ACTIVITY_ORGANIZATION_ID,
        discordGuildId: guildId,
        channelId,
        panelType: 'hub',
        status: 'publishing',
        operationId,
        nonce,
        correlationId: operationId,
        ...(hub?.messageId ? { messageId: hub.messageId } : {}),
      },
      {
        ...actor,
        idempotencyKey: idem(interaction.user.id, 'panel-upsert', `${guildId}:${channelId}`),
      },
    );

    const opaquePanelId =
      typeof panel.opaqueId === 'string' && /^[a-f0-9]{12}$/.test(panel.opaqueId)
        ? panel.opaqueId
        : opaqueFromUuid(panel.id);

    const payload = toComponentsV2Payload(
      renderActivityHubMessage({
        opaquePanelId,
        signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      }),
    );

    let messageId =
      typeof panel.messageId === 'string'
        ? panel.messageId
        : typeof hub?.messageId === 'string'
          ? hub.messageId
          : null;
    let mode: 'updated' | 'created' = 'created';

    if (messageId) {
      try {
        await this.deps.gateway.fetchChannelMessage(channelId, messageId);
        await this.deps.gateway.editComponentsV2Message(channelId, messageId, payload);
        mode = 'updated';
      } catch (error) {
        this.deps.logger.warn('Hub message missing or not editable; publishing new message', {
          messageId,
          error: error instanceof Error ? error.message : String(error),
        });
        messageId = null;
      }
    }

    if (!messageId) {
      const published = await this.deps.gateway.publishComponentsV2Message(channelId, payload, {
        nonce,
      });
      messageId = published.messageId;
      mode = 'created';
    }

    await this.deps.activityClient.upsertPanel(
      {
        organizationId: this.deps.config.ACTIVITY_ORGANIZATION_ID,
        discordGuildId: guildId,
        channelId,
        panelType: 'hub',
        messageId,
        status: 'active',
        operationId: `${operationId}:ack`,
        nonce,
      },
      {
        ...actor,
        idempotencyKey: idem(interaction.user.id, 'panel-ack', messageId),
      },
    );

    await interaction.editReply({
      content:
        mode === 'updated'
          ? 'Panel Centrum zaktualizowany w istniejącej wiadomości.'
          : 'Panel Centrum opublikowany.',
    });
  }

  private async hubStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guildId ?? this.deps.config.DISCORD_TEST_GUILD_ID;
    const panels = await this.deps.activityClient.listPanels(guildId, actorOf(interaction.user.id));
    const lines =
      panels.length === 0
        ? ['Brak panelu Centrum.']
        : panels.map((p) => {
            const status = typeof p.status === 'string' ? p.status : '?';
            const hasMsg = typeof p.messageId === 'string' && p.messageId.length > 0;
            return `• status: **${status}** · wiadomość: ${hasMsg ? 'jest' : 'brak'}`;
          });
    await interaction.editReply({ content: ['**Centrum — status**', ...lines].join('\n') });
  }

  private async reconcileHub(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!isOperator(interaction, this.deps.config)) {
      await interaction.reply({
        content: 'Tylko operatorzy testowi mogą uzgadniać panel.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guildId ?? this.deps.config.DISCORD_TEST_GUILD_ID;
    const channelId = interaction.channelId;
    const panels = await this.deps.activityClient.listPanels(guildId, actorOf(interaction.user.id));
    const hub =
      panels.find((p) => {
        const row = p as { panelType?: string; channelId?: string };
        return (
          (row.panelType === 'hub' || row.panelType === undefined) &&
          (channelId === null || row.channelId === undefined || row.channelId === channelId)
        );
      }) ?? panels[0];
    if (hub === undefined) {
      await interaction.editReply({
        content: 'Brak panelu do uzgodnienia — użyj `/centrum-panel`.',
      });
      return;
    }
    if (hub.messageId && hub.channelId) {
      try {
        await this.deps.gateway.fetchChannelMessage(hub.channelId, hub.messageId);
        const opaquePanelId =
          typeof hub.opaqueId === 'string' && /^[a-f0-9]{12}$/.test(hub.opaqueId)
            ? hub.opaqueId
            : opaqueFromUuid(hub.id);
        const payload = toComponentsV2Payload(
          renderActivityHubMessage({
            opaquePanelId,
            signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
          }),
        );
        await this.deps.gateway.editComponentsV2Message(hub.channelId, hub.messageId, payload);
        await interaction.editReply({
          content: 'Panel uzgodniony — zaktualizowano istniejącą wiadomość (bez duplikatu).',
        });
        return;
      } catch {
        // fall through
      }
    }
    await interaction.editReply({
      content:
        'Nie znaleziono wiadomości panelu. Uruchom `/centrum-panel` w docelowym kanale, aby odtworzyć jedną wiadomość.',
    });
  }

  private async seedGuild(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!isOperator(interaction, this.deps.config)) {
      await interaction.reply({
        content: 'Tylko operatorzy testowi mogą uruchomić seed.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (this.deps.config.NODE_ENV === 'production') {
      await interaction.reply({
        content: 'Seed testowy jest wyłączony w production.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!this.deps.config.ACTIVITY_ALLOW_TEST_SEED) {
      await interaction.reply({
        content: 'Seed wymaga włączenia trybu testowego seed.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (this.deps.config.ACTIVITY_ENABLED) {
      await interaction.reply({
        content: 'Seed jest dostępny tylko w trybie testowym Authorization.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (interaction.channelId === null) {
      await interaction.reply({
        content: 'Seed wymaga uruchomienia w kanale tekstowym.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guildId ?? this.deps.config.DISCORD_TEST_GUILD_ID;
    await this.deps.activityClient.ensureDefaults(
      guildId,
      { orgId: this.deps.config.ACTIVITY_ORGANIZATION_ID },
      {
        ...actorOf(interaction.user.id),
        idempotencyKey: idem(interaction.user.id, 'ensure-defaults', guildId),
      },
    );
    const result = await this.deps.activityClient.seedTestData(
      {
        guildId,
        orgId: this.deps.config.ACTIVITY_ORGANIZATION_ID,
        channelId: interaction.channelId,
      },
      {
        ...actorOf(interaction.user.id),
        idempotencyKey: idem(interaction.user.id, 'seed', guildId),
      },
    );
    const statuses = (result as { statuses?: unknown }).statuses;
    await interaction.editReply({
      content: `Konfiguracja testowa gotowa. Statusów: ${Array.isArray(statuses) ? statuses.length : '?'}`,
    });
  }

  private async handlePanelAction(
    interaction: MessageComponentInteraction,
    parsed: Extract<ParsedActivityCustomId, { scope: 'panel' }>,
  ): Promise<void> {
    const guildId = interaction.guildId ?? this.deps.config.DISCORD_TEST_GUILD_ID;
    const userId = interaction.user.id;

    if (parsed.action === 'mine') {
      const activities = await this.deps.activityClient.listMyActivities(guildId, actorOf(userId));
      const organizing: string[] = [];
      const joined: string[] = [];
      const finished: string[] = [];
      for (const a of activities.slice(0, 40)) {
        const name = typeof a.name === 'string' ? a.name : 'Aktywność';
        const status = typeof a.status === 'string' ? a.status : '';
        const line = `• **${name}**`;
        if (status === 'finished' || status === 'cancelled') {
          finished.push(line);
        } else if (
          typeof a.organizerDiscordUserId === 'string' &&
          a.organizerDiscordUserId === userId
        ) {
          organizing.push(line);
        } else {
          joined.push(line);
        }
      }
      const blocks = [
        '## Moje aktywności',
        '',
        '**Organizuję**',
        ...(organizing.length > 0 ? organizing : ['_Brak._']),
        '',
        '**Jestem zapisany**',
        ...(joined.length > 0 ? joined : ['_Brak._']),
        '',
        '**Zakończone / anulowane**',
        ...(finished.length > 0 ? finished.slice(0, 10) : ['_Brak._']),
      ];
      await interaction.editReply({ content: blocks.join('\n') });
      return;
    }

    if (parsed.action === 'inbox') {
      const inbox = await this.deps.activityClient.listInbox(actorOf(userId));
      const items = Array.isArray(inbox.items) ? inbox.items : [];
      const lines =
        items.length === 0
          ? []
          : items.slice(0, 15).map((item) => {
              const row = item as {
                kind?: string;
                readAt?: string | null;
                title?: string;
                body?: string;
              };
              const kindLabel = humanizeInboxKind(row.kind);
              const mark = row.readAt ? '✓' : '•';
              const title =
                typeof row.title === 'string'
                  ? row.title
                  : typeof row.body === 'string'
                    ? row.body.slice(0, 80)
                    : kindLabel;
              return `${mark} **${kindLabel}** — ${title}`;
            });
      await interaction.editReply(renderInboxList({ lines }));
    }
  }

  private async handleEventAction(
    interaction: MessageComponentInteraction,
    parsed: Extract<ParsedActivityCustomId, { scope: 'event' }>,
  ): Promise<void> {
    const activity = await this.deps.activityClient.lookupActivityByOpaque(
      parsed.opaqueId,
      actorOf(interaction.user.id),
    );
    const activityId = String(activity.id);
    const guildId =
      typeof activity.guildId === 'string'
        ? activity.guildId
        : (interaction.guildId ?? this.deps.config.DISCORD_TEST_GUILD_ID);

    if (parsed.action === 'rsvp' && parsed.statusOpaqueId !== undefined) {
      const statusDefId = await this.resolveStatusDefId(
        guildId,
        parsed.statusOpaqueId,
        interaction.user.id,
      );
      const participation = await this.deps.activityClient.rsvp(
        activityId,
        { statusDefId },
        {
          ...actorOf(interaction.user.id),
          idempotencyKey: idem(
            interaction.user.id,
            'rsvp',
            `${activityId}:${parsed.statusOpaqueId}`,
          ),
        },
      );
      const waitlist =
        typeof participation.waitlistPosition === 'number'
          ? `\nLista rezerwowa: pozycja ${participation.waitlistPosition}.`
          : '';
      await interaction.editReply({ content: `Zapis przyjęty.${waitlist}` });
      return;
    }

    if (parsed.action === 'participants') {
      const list = await this.deps.activityClient.listParticipants(
        activityId,
        actorOf(interaction.user.id),
      );
      const lines =
        list.length === 0
          ? ['Brak uczestników.']
          : list.slice(0, 30).map((p) => {
              const wl =
                p.waitlistPosition !== null && p.waitlistPosition !== undefined
                  ? ` (lista rezerwowa #${p.waitlistPosition})`
                  : '';
              return `• <@${p.discordUserId ?? '?'}>${wl}`;
            });
      await interaction.editReply({ content: ['**Uczestnicy**', ...lines].join('\n') });
      return;
    }

    if (parsed.action === 'contact') {
      const organizer =
        typeof activity.organizerDiscordUserId === 'string'
          ? activity.organizerDiscordUserId
          : null;
      const co =
        typeof activity.coOrganizerDiscordUserId === 'string'
          ? `\nWspółorganizator: <@${activity.coOrganizerDiscordUserId}>`
          : '';
      await interaction.editReply({
        content:
          organizer === null
            ? 'Brak danych organizatora.'
            : `Organizator: <@${organizer}>${co}`,
      });
      return;
    }

    if (parsed.action === 'more') {
      await interaction.editReply({
        content: '**Więcej** — wybierz akcję:',
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(
                createEventCustomId(
                  parsed.opaqueId,
                  'resign',
                  this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
                ),
              )
              .setLabel('Zrezygnuj')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(
                createEventCustomId(
                  parsed.opaqueId,
                  'report',
                  this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
                ),
              )
              .setLabel('Zgłoś')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(
                createEventCustomId(
                  parsed.opaqueId,
                  'reconfirm',
                  this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
                ),
              )
              .setLabel('Potwierdź udział')
              .setStyle(ButtonStyle.Success),
          ),
        ],
      });
      return;
    }

    if (parsed.action === 'resign') {
      await this.deps.activityClient.resign(activityId, {
        ...actorOf(interaction.user.id),
        idempotencyKey: idem(interaction.user.id, 'resign', activityId),
      });
      await interaction.editReply({ content: 'Wypisano z wydarzenia.' });
      return;
    }

    if (parsed.action === 'reconfirm') {
      await this.deps.activityClient.reconfirm(activityId, {
        ...actorOf(interaction.user.id),
        idempotencyKey: idem(interaction.user.id, 'reconfirm', activityId),
      });
      await interaction.editReply({ content: 'Potwierdzono udział po zmianie terminu.' });
      return;
    }

    if (parsed.action === 'report') {
      await this.deps.activityClient.createReport(
        activityId,
        { reasonCategory: 'other', details: 'Reported via Discord Więcej' },
        {
          ...actorOf(interaction.user.id),
          idempotencyKey: idem(interaction.user.id, 'report', activityId),
        },
      );
      await interaction.editReply({ content: 'Zgłoszenie zapisane.' });
      return;
    }

    await interaction.editReply({ content: 'Ta akcja nie jest jeszcze dostępna.' });
  }

  private async handleDraftAction(
    interaction: MessageComponentInteraction,
    parsed: Extract<ParsedActivityCustomId, { scope: 'draft' }>,
  ): Promise<void> {
    const draft = await this.deps.activityClient.lookupDraftByOpaque(
      parsed.opaqueId,
      actorOf(interaction.user.id),
    );
    const payload = draftPayload(draft);

    if (parsed.action === 'preview') {
      const name = typeof payload.name === 'string' ? payload.name : 'Bez nazwy';
      const when =
        typeof payload.startAt === 'string'
          ? formatPolishLocalDateTime(new Date(payload.startAt))
          : 'brak terminu';
      const description =
        typeof payload.description === 'string' && payload.description.trim()
          ? payload.description
          : '—';
      await interaction.editReply(
        renderDraftFormSummary({
          opaqueDraftId: parsed.opaqueId,
          signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
          title: `Podgląd — ${name}`,
          lines: [
            `**Data i godzina:** ${when}`,
            `**Opis:** ${description}`,
            '',
            '_Podgląd — wydarzenie nie zostało jeszcze opublikowane._',
          ],
        }),
      );
      return;
    }

    if (parsed.action === 'publish') {
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      const startRaw = typeof payload.startAt === 'string' ? payload.startAt : '';
      if (!name || !startRaw) {
        await interaction.editReply({
          content:
            'Uzupełnij nazwę oraz datę i godzinę przed publikacją.',
          components: renderDraftFormSummary({
            opaqueDraftId: parsed.opaqueId,
            signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
            lines: draftSummaryLines(payload),
          }).components,
        });
        return;
      }
      const published = await this.deps.activityClient.publishDraft(
        draft.id,
        {
          organizationId: this.deps.config.ACTIVITY_ORGANIZATION_ID,
          name,
          startAt: startRaw,
          ...(typeof payload.description === 'string'
            ? { description: payload.description }
            : {}),
          ...(interaction.channelId !== null
            ? { publicationChannelId: interaction.channelId }
            : {}),
        },
        {
          ...actorOf(interaction.user.id),
          idempotencyKey: idem(interaction.user.id, 'draft-publish', draft.id),
        },
      );
      await interaction.editReply({
        content: `Opublikowano **${String(published.name ?? name)}**. Publiczny post pojawi się na kanale aktywności.`,
      });
      return;
    }

    if (parsed.action === 'discard') {
      await this.deps.activityClient.discardDraft(draft.id, {
        ...actorOf(interaction.user.id),
        idempotencyKey: idem(interaction.user.id, 'draft-discard', draft.id),
      });
      await interaction.editReply({ content: 'Szkic odrzucony.' });
      return;
    }

    await interaction.editReply({
      content: 'Nieznana akcja szkicu.',
    });
  }

  private async resolveStatusDefId(
    guildId: string,
    statusOpaqueId: string,
    userId: string,
  ): Promise<string> {
    const config = await this.deps.activityClient.getGuildConfig(guildId, actorOf(userId));
    const statuses = Array.isArray(config.statuses) ? config.statuses : [];
    const match = statuses.find((status) => {
      const opaque =
        typeof status.opaqueId === 'string' && status.opaqueId.length === 12
          ? status.opaqueId
          : opaqueFromUuid(status.id);
      return opaque === statusOpaqueId;
    });
    if (match === undefined) {
      throw new Error('Nie znaleziono wybranego statusu zapisu.');
    }
    return match.id;
  }
}

function humanizeInboxKind(kind: string | undefined): string {
  switch (kind) {
    case 'waitlist_promoted':
    case 'waitlist':
      return 'Lista rezerwowa';
    case 'reconfirm':
    case 'reconfirmation':
      return 'Ponowne potwierdzenie';
    case 'cancelled':
    case 'cancel':
      return 'Anulowanie';
    case 'reschedule':
      return 'Zmiana terminu';
    default:
      return 'Powiadomienie';
  }
}
