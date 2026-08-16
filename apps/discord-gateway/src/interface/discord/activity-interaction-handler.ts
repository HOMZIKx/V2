/**
 * Activity Centrum interaction handlers (P4.2).
 * Business rules stay in activity-service; gateway only maps Discord ↔ HTTP.
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
import type { ActivityHttpClient } from '../../infrastructure/activity/activity-http-client.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import {
  createDraftCustomId,
  createEventCustomId,
  isActivityCustomId,
  parseActivityCustomId,
  type ParsedActivityCustomId,
} from '../../infrastructure/security/activity-signed-custom-id.js';
import { renderActivityHubMessage } from '../../presentation/discord/activity-hub-renderer.js';
import { toComponentsV2Payload } from '../../presentation/discord/components-v2-payload.js';

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

    // create/lfg must showModal BEFORE any defer.
    if (parsed.scope === 'panel' && (parsed.action === 'create' || parsed.action === 'lfg')) {
      await this.openCreateOrLfgModal(interaction, parsed);
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
      const message = error instanceof Error ? error.message : 'Nieznany błąd';
      await interaction.editReply({
        content: `Nie udało się wykonać akcji Centrum: ${message.slice(0, 180)}`,
      });
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

    if (kind === 'basics' && draftId !== undefined) {
      const name = interaction.fields.getTextInputValue('name');
      const description = interaction.fields.getTextInputValue('description');
      const startAt = interaction.fields.getTextInputValue('startAt');
      await this.deps.activityClient.updateDraft(
        draftId,
        { payload: { name, description, startAt } },
        {
          ...actorOf(interaction.user.id),
          idempotencyKey: idem(interaction.user.id, 'draft-update', draftId),
        },
      );
      await interaction.editReply({
        content: `Zapisano sekcję podstawową draftu.\n**Nazwa:** ${name}\n**Start:** ${startAt}`,
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(
                createDraftCustomId(
                  opaqueFromUuid(draftId),
                  'preview',
                  this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
                ),
              )
              .setLabel('Podgląd')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(
                createDraftCustomId(
                  opaqueFromUuid(draftId),
                  'publish',
                  this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
                ),
              )
              .setLabel('Publikuj')
              .setStyle(ButtonStyle.Success),
          ),
        ],
      });
      return true;
    }

    if (kind === 'lfg' && draftId !== undefined) {
      const name = interaction.fields.getTextInputValue('name');
      const startAt = interaction.fields.getTextInputValue('startAt');
      await this.deps.activityClient.updateDraft(
        draftId,
        { payload: { name, startAt, lfg: true } },
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
          startAt,
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
        content: `Opublikowano „Szukam ekipy”: **${published.name ?? name}** (\`${published.id}\`).`,
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

    await interaction.editReply({ content: 'Nieobsługiwany modal Centrum.' });
    return true;
  }

  private async openCreateOrLfgModal(
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

      const modal = new ModalBuilder()
        .setCustomId(`activity:v1:modal:${parsed.action === 'lfg' ? 'lfg' : 'basics'}:${draft.id}`)
        .setTitle(parsed.action === 'lfg' ? 'Szukam ekipy' : 'Utwórz aktywność');

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Nazwa')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100),
        ),
        ...(parsed.action === 'create'
          ? [
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId('description')
                  .setLabel('Opis')
                  .setStyle(TextInputStyle.Paragraph)
                  .setRequired(false)
                  .setMaxLength(1000),
              ),
            ]
          : []),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('startAt')
            .setLabel('Start (ISO, np. 2026-08-20T18:00:00.000Z)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(40),
        ),
      );

      await interaction.showModal(modal);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nieznany błąd';
      await interaction.reply({
        content: `Nie udało się otworzyć formularza: ${message.slice(0, 180)}`,
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
      },
      {
        ...actorOf(interaction.user.id),
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

    let messageId = typeof panel.messageId === 'string' ? panel.messageId : null;
    if (messageId) {
      try {
        await this.deps.gateway.editComponentsV2Message(channelId, messageId, payload);
      } catch {
        messageId = null;
      }
    }
    if (!messageId) {
      const published = await this.deps.gateway.publishComponentsV2Message(channelId, payload, {
        nonce,
      });
      messageId = published.messageId;
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
        ...actorOf(interaction.user.id),
        idempotencyKey: idem(interaction.user.id, 'panel-ack', messageId),
      },
    );

    await interaction.editReply({
      content: `Panel Centrum opublikowany (opaque \`${opaquePanelId}\`, message \`${messageId}\`).`,
    });
  }

  private async hubStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guildId ?? this.deps.config.DISCORD_TEST_GUILD_ID;
    const panels = await this.deps.activityClient.listPanels(guildId, actorOf(interaction.user.id));
    const lines =
      panels.length === 0
        ? ['Brak paneli w activity-service.']
        : panels.map(
            (p) =>
              `• \`${p.id}\` opaque=\`${p.opaqueId ?? '?'}\` status=\`${p.status ?? '?'}\` msg=\`${p.messageId ?? 'brak'}\``,
          );
    await interaction.editReply({ content: ['**Centrum — status paneli**', ...lines].join('\n') });
  }

  private async reconcileHub(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!isOperator(interaction, this.deps.config)) {
      await interaction.reply({
        content: 'Tylko operatorzy testowi mogą reconcile panelu.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guildId ?? this.deps.config.DISCORD_TEST_GUILD_ID;
    const panels = await this.deps.activityClient.listPanels(guildId, actorOf(interaction.user.id));
    const hub =
      panels.find((p) => {
        const row = p as { panelType?: string };
        return row.panelType === 'hub' || row.panelType === undefined;
      }) ?? panels[0];
    if (hub === undefined) {
      await interaction.editReply({ content: 'Brak panelu do reconcile — użyj `/centrum-panel`.' });
      return;
    }
    if (hub.messageId && hub.channelId) {
      try {
        await this.deps.gateway.fetchChannelMessage(hub.channelId, hub.messageId);
        await interaction.editReply({
          content: `Adopt OK — istniejąca wiadomość \`${hub.messageId}\` pozostaje kanoniczna.`,
        });
        return;
      } catch {
        // recreate hint below
      }
    }
    await interaction.editReply({
      content:
        'Wiadomość panelu nieznaleziona. Uruchom ponownie `/centrum-panel` (nonce/adopt po stronie occurrence).',
    });
  }

  private async seedGuild(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!isOperator(interaction, this.deps.config)) {
      await interaction.reply({
        content: 'Tylko operatorzy testowi mogą seedować guild.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (this.deps.config.ACTIVITY_ENABLED) {
      await interaction.reply({
        content: 'Seed jest dostępny tylko gdy `ACTIVITY_ENABLED=false` (ścieżka testowa).',
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
        organizationId: this.deps.config.ACTIVITY_ORGANIZATION_ID,
        ...(interaction.channelId !== null ? { channelId: interaction.channelId } : {}),
      },
      {
        ...actorOf(interaction.user.id),
        idempotencyKey: idem(interaction.user.id, 'seed', guildId),
      },
    );
    const statuses = (result as { statuses?: unknown }).statuses;
    await interaction.editReply({
      content: `Seed testowy OK. Statusów: ${Array.isArray(statuses) ? statuses.length : '?'}`,
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
      const lines =
        activities.length === 0
          ? ['Brak aktywności.']
          : activities.slice(0, 15).map((a) => `• **${a.name ?? a.id}** — \`${a.status ?? '?'}\``);
      await interaction.editReply({ content: ['**Moje aktywności**', ...lines].join('\n') });
      return;
    }

    if (parsed.action === 'inbox') {
      const inbox = await this.deps.activityClient.listInbox(actorOf(userId));
      const items = Array.isArray(inbox.items) ? inbox.items : [];
      const lines =
        items.length === 0
          ? ['Skrzynka pusta.']
          : items.slice(0, 15).map((item) => {
              const row = item as { kind?: string; readAt?: string | null };
              return `• ${row.readAt ? '✓' : '•'} \`${row.kind ?? 'notice'}\``;
            });
      await interaction.editReply({ content: ['**Powiadomienia**', ...lines].join('\n') });
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
      await interaction.editReply({ content: `RSVP zapisane.${waitlist}` });
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
                  ? ` (WL #${p.waitlistPosition})`
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
          : 'unknown';
      const co =
        typeof activity.coOrganizerDiscordUserId === 'string'
          ? `\nWspółorganizator: <@${activity.coOrganizerDiscordUserId}>`
          : '';
      await interaction.editReply({
        content: `Organizator: <@${organizer}>${co}`,
      });
      return;
    }

    if (parsed.action === 'more') {
      await interaction.editReply({
        content: '**Więcej** — akcje zależą od uprawnień (sprawdzane przy każdej akcji).',
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
              .setLabel('Potwierdź obecność')
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

    await interaction.editReply({ content: `Akcja \`${parsed.action}\` przyjęta (P4.2).` });
  }

  private async handleDraftAction(
    interaction: MessageComponentInteraction,
    parsed: Extract<ParsedActivityCustomId, { scope: 'draft' }>,
  ): Promise<void> {
    await interaction.editReply({
      content: `Draft action \`${parsed.action}\` — użyj formularza z „Utwórz aktywność” / LFG (opaque=\`${parsed.opaqueId}\`).`,
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
      throw new Error(`Nie znaleziono statusu RSVP dla opaque \`${statusOpaqueId}\`.`);
    }
    return match.id;
  }
}
