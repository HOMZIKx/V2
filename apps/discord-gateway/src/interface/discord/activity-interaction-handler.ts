/**
 * Activity Centrum interaction handlers (P4.2 product UX pass).
 * Business rules stay in activity-service; gateway maps Discord ↔ HTTP.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { createHash } from 'node:crypto';

import {
  getHubModule,
  isHubModuleKey,
  isPartyRoleKey,
  LFG_DUNGEON_ACTIVITY_TYPES,
} from '@v2/hub-core';

import { authorizePanelOperator } from '../../application/interactions/authorization.js';
import {
  ActivityHttpError,
  type ActivityHttpClient,
} from '../../infrastructure/activity/activity-http-client.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import type { IdentityHttpClient } from '../../infrastructure/identity/identity-http-client.js';
import { createIdentityHttpClientOrNull } from '../../infrastructure/identity/identity-http-client.js';
import {
  createEventCustomId,
  isActivityCustomId,
  isActivityModalCustomId,
  parseActivityCustomId,
  parseModalCustomId,
  type ParsedActivityCustomId,
} from '../../infrastructure/security/activity-signed-custom-id.js';
import {
  isLfgCustomId,
  parseLfgCustomId,
  type ParsedLfgCustomId,
} from '../../infrastructure/security/lfg-signed-custom-id.js';
import {
  draftPayloadToFormUiState,
  formUiStateToModalPayload,
  type DraftFormUiState,
} from '../../presentation/discord/activity-draft-ui-state.js';
import {
  isDraftPreviewMessage,
  renderDraftFormSummary,
  renderInboxList,
} from '../../presentation/discord/activity-ephemeral-renderer.js';
import {
  buildActivityFormModal,
  parseActivityFormModal,
  scheduleToDraftPayload,
} from '../../presentation/discord/activity-schedule-form.js';
import { toUserFacingError } from '../../presentation/discord/activity-user-errors.js';
import { DraftUiStateCache } from '../../presentation/discord/draft-ui-state-cache.js';
import {
  renderHubActivitiesMenu,
  renderHubForMeFoundationEphemeral,
  renderHubProfileFoundationEphemeral,
  renderHubRoadmapEphemeral,
} from '../../presentation/discord/hub-module-ephemeral.js';
import {
  applyProfileCharacter,
  buildLfgSearchBody,
  buildLfgWatchBody,
  isWizardReady,
  mapSearchMatches,
  renderLfgHubEphemeral,
  toggleSessionRole,
  type LfgWatchRow,
} from '../../presentation/discord/lfg-hub-ephemeral.js';
import {
  createDefaultLfgWizardState,
  LfgUiStateCache,
  type LfgUiStateCacheKey,
  type LfgWizardState,
} from '../../presentation/discord/lfg-ui-state-cache.js';
import {
  formatPolishLocalDateTime,
  LocalizedDateParseError,
} from '../../presentation/discord/localized-datetime.js';
import { executeHubPanelOperation } from './hub-panel-operation.js';

export type ActivityInteractionDeps = {
  config: DiscordGatewayConfig;
  gateway: DiscordJsGatewayAdapter;
  activityClient: ActivityHttpClient;
  identityClient?: IdentityHttpClient | null;
  logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
  draftUiStateCache?: DraftUiStateCache;
  lfgUiStateCache?: LfgUiStateCache;
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

/** Discord.js editReply + Components V2 is awkward under exactOptionalPropertyTypes. */
function asEditPayload(view: {
  content?: string | undefined;
  components?: unknown;
  flags?: unknown;
}): Parameters<MessageComponentInteraction['editReply']>[0] {
  const payload: Record<string, unknown> = {
    flags: MessageFlags.IsComponentsV2,
  };
  if (typeof view.content === 'string') {
    payload.content = view.content;
  }
  if (view.components !== undefined) {
    payload.components = view.components;
  }
  return payload;
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

function draftPayload(draft: {
  payload?: Record<string, unknown> | undefined;
}): Record<string, unknown> {
  return draft.payload ?? {};
}

function draftSummaryLines(payload: Record<string, unknown>): string[] {
  const description =
    typeof payload.description === 'string' && payload.description.trim()
      ? payload.description.trim().slice(0, 180)
      : null;
  const when =
    typeof payload.scheduleLabel === 'string' && payload.scheduleLabel.trim()
      ? payload.scheduleLabel.trim()
      : typeof payload.startAtDisplay === 'string'
        ? payload.startAtDisplay
        : typeof payload.startAt === 'string' && payload.startAt.length > 0
          ? formatPolishLocalDateTime(new Date(payload.startAt))
          : 'Termin do uzupełnienia';
  const limit =
    typeof payload.participantLimit === 'number'
      ? `Miejsca: ${payload.participantLimit}`
      : typeof payload.limit === 'number'
        ? `Miejsca: ${payload.limit}`
        : null;
  return [`**${when}**`, description, limit].filter((line): line is string => line !== null);
}

export class ActivityInteractionHandler {
  private readonly draftUiCache: DraftUiStateCache;
  private readonly lfgUiCache: LfgUiStateCache;
  private readonly identityClient: IdentityHttpClient | null;

  public constructor(private readonly deps: ActivityInteractionDeps) {
    this.draftUiCache = deps.draftUiStateCache ?? new DraftUiStateCache();
    this.lfgUiCache = deps.lfgUiStateCache ?? new LfgUiStateCache();
    this.identityClient =
      deps.identityClient ??
      createIdentityHttpClientOrNull({
        DISCORD_ACTIVITY_ENABLED: deps.config.DISCORD_ACTIVITY_ENABLED,
        IDENTITY_SERVICE_BASE_URL: deps.config.IDENTITY_SERVICE_BASE_URL,
        ACTIVITY_CLIENT_MODE: deps.config.ACTIVITY_CLIENT_MODE,
        DISCORD_CLIENT_ASSERTION_MAX_TTL_SECONDS:
          deps.config.DISCORD_CLIENT_ASSERTION_MAX_TTL_SECONDS,
      });
  }

  private resolveGuildId(guildId: string | null): string {
    return guildId ?? this.deps.config.DISCORD_TEST_GUILD_ID;
  }

  private rememberDraftFormUiState(
    guildId: string | null,
    discordUserId: string,
    opaqueDraftId: string,
    state: DraftFormUiState,
  ): void {
    this.draftUiCache.set(
      {
        guildId: this.resolveGuildId(guildId),
        discordUserId,
        opaqueDraftId,
      },
      state,
    );
  }

  private readDraftFormUiState(
    guildId: string | null,
    discordUserId: string,
    opaqueDraftId: string,
  ): DraftFormUiState | null {
    return this.draftUiCache.get({
      guildId: this.resolveGuildId(guildId),
      discordUserId,
      opaqueDraftId,
    });
  }

  private forgetDraftFormUiState(
    guildId: string | null,
    discordUserId: string,
    opaqueDraftId: string,
  ): void {
    this.draftUiCache.delete({
      guildId: this.resolveGuildId(guildId),
      discordUserId,
      opaqueDraftId,
    });
  }

  private lfgCacheKey(
    guildId: string | null,
    discordUserId: string,
    opaquePanelId: string,
  ): LfgUiStateCacheKey {
    return {
      guildId: this.resolveGuildId(guildId),
      discordUserId,
      opaquePanelId,
    };
  }

  private readLfgState(
    guildId: string | null,
    discordUserId: string,
    opaquePanelId: string,
  ): LfgWizardState {
    return (
      this.lfgUiCache.get(this.lfgCacheKey(guildId, discordUserId, opaquePanelId)) ??
      createDefaultLfgWizardState()
    );
  }

  private writeLfgState(
    guildId: string | null,
    discordUserId: string,
    opaquePanelId: string,
    state: LfgWizardState,
  ): void {
    this.lfgUiCache.set(this.lfgCacheKey(guildId, discordUserId, opaquePanelId), state);
  }

  private async loadProfile(discordUserId: string) {
    if (this.identityClient === null) {
      return null;
    }
    try {
      return await this.identityClient.getProfile({ discordUserId });
    } catch (error) {
      this.deps.logger.warn('LFG profile load failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private renderLfgView(input: {
    opaquePanelId: string;
    state: LfgWizardState;
    profile: Awaited<ReturnType<ActivityInteractionHandler['loadProfile']>>;
    watches?: readonly LfgWatchRow[];
    statusLine?: string;
  }): InteractionReplyOptions {
    return renderLfgHubEphemeral({
      opaquePanelId: input.opaquePanelId,
      signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      state: input.state,
      profile: input.profile,
      ...(input.watches !== undefined ? { watches: input.watches } : {}),
      ...(input.statusLine !== undefined ? { statusLine: input.statusLine } : {}),
    });
  }

  public isActivityComponent(customId: string): boolean {
    return isActivityCustomId(customId) || isLfgCustomId(customId);
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

    if (isLfgCustomId(interaction.customId)) {
      await this.handleLfgComponent(interaction);
      return true;
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

    if (parsed.scope === 'panel' && parsed.action === 'create') {
      await this.openCreateOrLfg(interaction, parsed);
      return true;
    }

    if (parsed.scope === 'panel' && parsed.action === 'lfg') {
      await this.openLfgWizard(interaction, parsed.opaqueId);
      return true;
    }

    if (
      parsed.scope === 'panel' &&
      parsed.action === 'module' &&
      interaction.isStringSelectMenu()
    ) {
      await this.handleHubModuleSelect(interaction, parsed);
      return true;
    }

    if (parsed.scope === 'draft' && parsed.action === 'edit') {
      await this.openDraftEditModal(interaction, parsed);
      return true;
    }

    // Legacy sectional actions → open the same full form.
    if (parsed.scope === 'draft' && parsed.action.startsWith('section_')) {
      await this.openDraftEditModal(interaction, parsed);
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
        operation: 'component',
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
    if (!isActivityModalCustomId(interaction.customId)) {
      return false;
    }

    let parsedModal;
    try {
      parsedModal = parseModalCustomId(
        interaction.customId,
        this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      );
    } catch {
      await interaction.reply({
        content: 'Nieprawidłowy formularz Centrum.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const { kind, opaqueId } = parsedModal;

    try {
      if ((kind === 'create' || kind === 'lfg' || kind === 'edit') && opaqueId !== undefined) {
        const fromExistingPreview = isDraftPreviewMessage(interaction.message);
        // Create: new ephemeral preview. Edit: ACK+update the same preview (no stack).
        if (fromExistingPreview) {
          await interaction.deferUpdate();
        } else {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }
        const parsedForm = parseActivityFormModal(interaction);
        const guildId = interaction.guildId ?? this.deps.config.DISCORD_TEST_GUILD_ID;
        const actor = actorOf(interaction.user.id);

        let draftId: string;
        let previousPayload: Record<string, unknown> = {};
        if (kind === 'create' || kind === 'lfg') {
          // Modal custom id carries panel opaque id; draft is created only after ACK.
          const created = await this.deps.activityClient.createDraft(
            {
              guildId,
              payload: { source: kind, panelOpaqueId: opaqueId },
            },
            {
              ...actor,
              idempotencyKey: idem(
                interaction.user.id,
                'draft-create',
                `${guildId}:${kind}:${opaqueId}:${interaction.id}`,
              ),
            },
          );
          draftId = created.id;
        } else {
          const existing = await this.deps.activityClient.lookupDraftByOpaque(opaqueId, actor);
          draftId = existing.id;
          previousPayload = draftPayload(existing);
        }

        const source =
          previousPayload.source === 'lfg' || previousPayload.lfg === true || kind === 'lfg'
            ? 'lfg'
            : 'create';
        const updated = await this.deps.activityClient.updateDraft(
          draftId,
          {
            payload: {
              ...previousPayload,
              ...scheduleToDraftPayload(parsedForm, {
                source,
                lfg: source === 'lfg',
              }),
            },
          },
          {
            ...actor,
            idempotencyKey: idem(
              interaction.user.id,
              'draft-form',
              `${opaqueId}:${interaction.id}`,
            ),
          },
        );
        const nextPayload = draftPayload(updated);
        const opaqueDraftId = opaqueFromUuid(updated.id);
        const formState = draftPayloadToFormUiState(nextPayload);
        this.rememberDraftFormUiState(
          interaction.guildId,
          interaction.user.id,
          opaqueDraftId,
          formState,
        );
        const preview = renderDraftFormSummary({
          opaqueDraftId,
          signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
          title: parsedForm.name,
          lines: draftSummaryLines(nextPayload),
        });

        if (fromExistingPreview) {
          await interaction.editReply(asEditPayload(preview));
          return true;
        }

        await interaction.editReply({
          ...preview,
          flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });
        return true;
      }

      // Legacy section modals → migrate into full-form preview without stacking.
      if ((kind === 'basics' || kind === 'schedule') && opaqueId !== undefined) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.editReply({
          content:
            'Ten formularz został zastąpiony. Kliknij **Edytuj** na podglądzie albo utwórz aktywność ponownie.',
        });
        return true;
      }

      if (kind === 'report') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const activity = await this.deps.activityClient.lookupActivityByOpaque(
          opaqueId,
          actorOf(interaction.user.id),
        );
        const reason = interaction.fields.getTextInputValue('reason');
        const details = interaction.fields.getTextInputValue('details');
        await this.deps.activityClient.createReport(
          activity.id,
          { reasonCategory: reason, details },
          {
            ...actorOf(interaction.user.id),
            idempotencyKey: idem(interaction.user.id, 'report', `${opaqueId}:${reason}`),
          },
        );
        await interaction.editReply({ content: 'Zgłoszenie zapisane. Dziękujemy.' });
        return true;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.editReply({ content: 'Nieobsługiwany formularz Centrum.' });
      return true;
    } catch (error) {
      this.deps.logger.error('Centrum modal failed', {
        error: error instanceof Error ? error.message : String(error),
        status: error instanceof ActivityHttpError ? error.status : undefined,
        operation: 'modal',
      });
      const content =
        error instanceof LocalizedDateParseError ? error.message : toUserFacingError(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content });
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
      return true;
    }
  }

  private async openCreateOrLfg(
    interaction: MessageComponentInteraction,
    parsed: Extract<ParsedActivityCustomId, { scope: 'panel' }>,
  ): Promise<void> {
    try {
      const modal = buildActivityFormModal({
        opaqueDraftId: parsed.opaqueId,
        signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
        mode: 'create',
      });
      await interaction.showModal(modal);
    } catch (error) {
      this.deps.logger.error('Centrum create open failed', {
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

  private async openLfgWizard(
    interaction: MessageComponentInteraction,
    opaquePanelId: string,
  ): Promise<void> {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const profile = await this.loadProfile(interaction.user.id);
      let state = this.readLfgState(interaction.guildId, interaction.user.id, opaquePanelId);
      state = applyProfileCharacter(state, profile);
      this.writeLfgState(interaction.guildId, interaction.user.id, opaquePanelId, state);
      await interaction.editReply(
        asEditPayload(this.renderLfgView({ opaquePanelId, state, profile })),
      );
    } catch (error) {
      this.deps.logger.error('Centrum LFG wizard open failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      const content = toUserFacingError(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content });
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
    }
  }

  private async handleLfgComponent(interaction: MessageComponentInteraction): Promise<void> {
    let parsed: ParsedLfgCustomId;
    try {
      parsed = parseLfgCustomId(
        interaction.customId,
        this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      );
    } catch {
      await interaction.reply({
        content:
          'Ta interakcja LFG jest nieprawidłowa lub wygasła. Otwórz **Szukam ekipy** ponownie.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const opaquePanelId = parsed.opaquePanelId;
    const guildId = this.resolveGuildId(interaction.guildId);
    const userId = interaction.user.id;
    const actor = actorOf(userId);
    const organizationId = this.deps.config.ACTIVITY_ORGANIZATION_ID;

    if (parsed.action === 'confirm_create') {
      const modal = buildActivityFormModal({
        opaqueDraftId: opaquePanelId,
        signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
        mode: 'lfg',
      });
      await interaction.showModal(modal);
      return;
    }

    const fromExisting =
      interaction.message !== null &&
      'flags' in interaction.message &&
      interaction.message.flags.has(MessageFlags.Ephemeral);
    if (fromExisting) {
      await interaction.deferUpdate();
    } else {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    try {
      let state = this.readLfgState(interaction.guildId, userId, opaquePanelId);
      const profile = await this.loadProfile(userId);
      let statusLine: string | undefined;
      let watches: readonly LfgWatchRow[] | undefined;

      if (parsed.action === 'dungeon' && interaction.isStringSelectMenu()) {
        const selected = interaction.values[0];
        if (selected !== undefined) {
          state = { ...state, dungeonKey: selected, matches: [], showAllMatches: false };
        }
      } else if (parsed.action === 'character' && interaction.isStringSelectMenu()) {
        const selected = interaction.values[0];
        if (selected !== undefined) {
          state = applyProfileCharacter(state, profile, selected);
        }
      } else if (parsed.action === 'quick_add' && interaction.isStringSelectMenu()) {
        const classSpecKey = interaction.values[0];
        if (classSpecKey !== undefined && this.identityClient !== null) {
          const nickname =
            ('displayName' in interaction.user &&
            typeof interaction.user.displayName === 'string' &&
            interaction.user.displayName.length > 0
              ? interaction.user.displayName
              : interaction.user.username) ?? 'Gracz';
          const created = await this.identityClient.createCharacter(
            {
              nickname: nickname.slice(0, 64),
              classSpecKey,
              partyRoles: ['TANK', 'BUFF', 'DPS', 'FLEX'],
              isDefault: true,
            },
            actor,
          );
          state = applyProfileCharacter(state, created.profile, created.characterId);
          statusLine = `Dodano postać **${nickname.slice(0, 64)}**.`;
        } else {
          statusLine = 'Profil niedostępny — skonfiguruj postać w /profil.';
        }
      } else if (
        parsed.action === 'role' &&
        parsed.param !== undefined &&
        isPartyRoleKey(parsed.param)
      ) {
        state = toggleSessionRole(state, parsed.param);
      } else if (parsed.action === 'time' && parsed.param !== undefined) {
        if (parsed.param === 'now' || parsed.param === 'plus2h' || parsed.param === 'evening') {
          state = { ...state, timePreset: parsed.param, matches: [], showAllMatches: false };
        }
      } else if (parsed.action === 'search') {
        const searchBody = buildLfgSearchBody({ guildId, organizationId, state });
        if (searchBody === null) {
          statusLine = 'Uzupełnij dungeon, postać, role i czas przed wyszukiwaniem.';
        } else {
          const result = await this.deps.activityClient.searchLfg(searchBody, actor);
          const dungeonLabel =
            LFG_DUNGEON_ACTIVITY_TYPES.find((entry) => entry.key === state.dungeonKey)?.label ??
            'Dungeon';
          const rawMatches = Array.isArray(result.matches)
            ? (result.matches as Record<string, unknown>[])
            : [];
          state = {
            ...state,
            matches: mapSearchMatches(rawMatches, dungeonLabel),
            showAllMatches: false,
            similarGroupsWarning:
              typeof result.similarGroupsWarning === 'string' ? result.similarGroupsWarning : null,
          };
          statusLine =
            state.matches.length > 0
              ? `Znaleziono ${String(state.matches.length)} dopasowań.`
              : 'Brak dopasowań — możesz włączyć poszukiwanie lub utworzyć własną ekipę.';
        }
      } else if (parsed.action === 'show_more') {
        state = { ...state, showAllMatches: true };
      } else if (parsed.action === 'view' && parsed.param !== undefined) {
        state = { ...state, screen: 'match_view', viewedMatchOpaqueId: parsed.param };
      } else if (parsed.action === 'back') {
        state = {
          ...state,
          screen: 'wizard',
          viewedMatchOpaqueId: null,
          similarGroupsWarning: null,
        };
      } else if (parsed.action === 'my_searches') {
        const listed = await this.deps.activityClient.listLfgWatches(guildId, actor);
        watches = listed.map((watch) => ({
          id: watch.id,
          activityTypeKey:
            typeof watch.activityTypeKey === 'string' ? watch.activityTypeKey : 'unknown',
          sessionRoles: Array.isArray(watch.sessionRoles) ? watch.sessionRoles : [],
          ...(typeof watch.windowStartAt === 'string'
            ? { windowStartAt: watch.windowStartAt }
            : {}),
          ...(typeof watch.windowEndAt === 'string' ? { windowEndAt: watch.windowEndAt } : {}),
          ...(typeof watch.expiresAt === 'string' ? { expiresAt: watch.expiresAt } : {}),
          pausedAt: watch.pausedAt ?? null,
          cancelledAt: watch.cancelledAt ?? null,
          fulfilledAt: watch.fulfilledAt ?? null,
        }));
        state = { ...state, screen: 'my_searches' };
      } else if (parsed.action === 'watch_pause' && parsed.param !== undefined) {
        await this.deps.activityClient.pauseLfgWatch(parsed.param, guildId, {
          ...actor,
          idempotencyKey: idem(userId, 'lfg-pause', parsed.param),
        });
        statusLine = 'Poszukiwanie wstrzymane.';
        state = { ...state, screen: 'my_searches' };
        watches = await this.loadLfgWatchRows(guildId, actor);
      } else if (parsed.action === 'watch_resume' && parsed.param !== undefined) {
        await this.deps.activityClient.resumeLfgWatch(parsed.param, guildId, {
          ...actor,
          idempotencyKey: idem(userId, 'lfg-resume', parsed.param),
        });
        statusLine = 'Poszukiwanie wznowione.';
        state = { ...state, screen: 'my_searches' };
        watches = await this.loadLfgWatchRows(guildId, actor);
      } else if (parsed.action === 'watch_cancel' && parsed.param !== undefined) {
        await this.deps.activityClient.cancelLfgWatch(parsed.param, guildId, {
          ...actor,
          idempotencyKey: idem(userId, 'lfg-cancel', parsed.param),
        });
        statusLine = 'Poszukiwanie anulowane.';
        state = { ...state, screen: 'my_searches' };
        watches = await this.loadLfgWatchRows(guildId, actor);
      } else if (parsed.action === 'watch') {
        const watchBody = buildLfgWatchBody({ guildId, organizationId, state });
        if (watchBody === null) {
          statusLine = 'Uzupełnij kryteria przed włączeniem poszukiwania.';
        } else {
          await this.deps.activityClient.createLfgWatch(watchBody, {
            ...actor,
            idempotencyKey: idem(
              userId,
              'lfg-watch',
              `${watchBody.activityTypeKey}:${watchBody.windowStartAt}`,
            ),
          });
          statusLine = 'Poszukiwanie włączone — powiadomimy Cię prywatnie o dopasowaniu.';
          state = { ...state, screen: 'wizard' };
        }
      } else if (parsed.action === 'create') {
        if (!isWizardReady(state)) {
          statusLine = 'Uzupełnij kryteria przed utworzeniem własnej ekipy.';
        } else {
          state = {
            ...state,
            screen: 'confirm_create',
            similarGroupsWarning:
              state.similarGroupsWarning ??
              'Sprawdź, czy nie ma już podobnej otwartej grupy — tworzenie duplikatu utrudnia składanie ekip.',
          };
        }
      } else if (parsed.action === 'join' && parsed.param !== undefined) {
        const match =
          state.matches.find((entry) => entry.opaqueId === parsed.param) ??
          state.matches.find((entry) => entry.activityId === parsed.param);
        if (match === undefined || state.characterId === null) {
          statusLine = 'Nie udało się dołączyć — odśwież wyszukiwanie.';
        } else {
          const primaryRole = state.sessionRoles[0];
          const joined = await this.deps.activityClient.joinLfg(
            {
              guildId,
              organizationId,
              activityId: match.activityId,
              characterId: state.characterId,
              sessionRoles: state.sessionRoles,
              ...(primaryRole !== undefined ? { partyRoleKey: primaryRole } : {}),
              ...(state.classSpecKey !== null ? { classSpecKey: state.classSpecKey } : {}),
            },
            {
              ...actor,
              idempotencyKey: idem(
                userId,
                'lfg-join',
                `${match.activityId}:${primaryRole ?? 'any'}`,
              ),
            },
          );
          const waitlist =
            typeof joined.waitlistPosition === 'number'
              ? ` Lista rezerwowa: pozycja ${String(joined.waitlistPosition)}.`
              : '';
          statusLine = `Dołączono do ekipy.${waitlist}`;
          state = { ...state, screen: 'wizard', viewedMatchOpaqueId: null };
        }
      } else if (parsed.action === 'suppress' && parsed.param !== undefined) {
        const match = state.matches.find((entry) => entry.opaqueId === parsed.param);
        if (match !== undefined) {
          await this.deps.activityClient.suppressLfgMatch(
            match.activityId,
            {
              guildId,
              organizationId,
              ...(match.fingerprint !== undefined ? { fingerprint: match.fingerprint } : {}),
            },
            {
              ...actor,
              idempotencyKey: idem(userId, 'lfg-suppress', match.activityId),
            },
          );
          state = {
            ...state,
            matches: state.matches.filter((entry) => entry.opaqueId !== parsed.param),
          };
          statusLine = 'Ukryto to dopasowanie.';
        }
      }

      if (state.screen === 'wizard' && state.characterId === null) {
        state = applyProfileCharacter(state, profile);
      }

      this.writeLfgState(interaction.guildId, userId, opaquePanelId, state);
      await interaction.editReply(
        asEditPayload(
          this.renderLfgView({
            opaquePanelId,
            state,
            profile,
            ...(watches !== undefined ? { watches } : {}),
            ...(statusLine !== undefined ? { statusLine } : {}),
          }),
        ),
      );
    } catch (error) {
      this.deps.logger.error('Centrum LFG component failed', {
        error: error instanceof Error ? error.message : String(error),
        status: error instanceof ActivityHttpError ? error.status : undefined,
        operation: parsed.action,
      });
      await interaction.editReply({ content: toUserFacingError(error) });
    }
  }

  private async loadLfgWatchRows(
    guildId: string,
    actor: ReturnType<typeof actorOf>,
  ): Promise<readonly LfgWatchRow[]> {
    const listed = await this.deps.activityClient.listLfgWatches(guildId, actor);
    return listed.map((watch) => ({
      id: watch.id,
      activityTypeKey:
        typeof watch.activityTypeKey === 'string' ? watch.activityTypeKey : 'unknown',
      sessionRoles: Array.isArray(watch.sessionRoles) ? watch.sessionRoles : [],
      ...(typeof watch.windowStartAt === 'string' ? { windowStartAt: watch.windowStartAt } : {}),
      ...(typeof watch.windowEndAt === 'string' ? { windowEndAt: watch.windowEndAt } : {}),
      ...(typeof watch.expiresAt === 'string' ? { expiresAt: watch.expiresAt } : {}),
      pausedAt: watch.pausedAt ?? null,
      cancelledAt: watch.cancelledAt ?? null,
      fulfilledAt: watch.fulfilledAt ?? null,
    }));
  }

  private async openDraftEditModal(
    interaction: MessageComponentInteraction,
    parsed: Extract<ParsedActivityCustomId, { scope: 'draft' }>,
  ): Promise<void> {
    try {
      const signingSecret = this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET;
      const snapshot = this.readDraftFormUiState(
        interaction.guildId,
        interaction.user.id,
        parsed.opaqueId,
      );
      if (snapshot !== null) {
        // First Discord response must be showModal — no unbounded HTTP beforehand.
        const modal = buildActivityFormModal({
          opaqueDraftId: parsed.opaqueId,
          signingSecret,
          mode: 'edit',
          payload: formUiStateToModalPayload(snapshot),
        });
        await interaction.showModal(modal);
        return;
      }

      await interaction.deferUpdate();
      const draft = await this.deps.activityClient.lookupDraftByOpaque(
        parsed.opaqueId,
        actorOf(interaction.user.id),
      );
      const payload = draftPayload(draft);
      const formState = draftPayloadToFormUiState(payload);
      this.rememberDraftFormUiState(
        interaction.guildId,
        interaction.user.id,
        parsed.opaqueId,
        formState,
      );
      const name = typeof payload.name === 'string' ? payload.name : 'Podgląd aktywności';
      await interaction.editReply(
        asEditPayload(
          renderDraftFormSummary({
            opaqueDraftId: parsed.opaqueId,
            signingSecret,
            title: name,
            lines: [
              ...draftSummaryLines(payload),
              '',
              'Dane formularza zostały odświeżone.',
              'Kliknij Edytuj ponownie.',
            ],
          }),
        ),
      );
    } catch (error) {
      this.deps.logger.error('Centrum draft edit modal failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      const content = toUserFacingError(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content });
      } else {
        await interaction.reply({
          content,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }

  private async publishHub(interaction: ChatInputCommandInteraction): Promise<void> {
    await this.runHubPanelOperation(interaction, {
      preferScanFirst: false,
      ackSuffix: 'panel-ack',
    });
  }

  private async reconcileHub(interaction: ChatInputCommandInteraction): Promise<void> {
    await this.runHubPanelOperation(interaction, {
      preferScanFirst: true,
      ackSuffix: 'panel-reconcile',
    });
  }

  private async runHubPanelOperation(
    interaction: ChatInputCommandInteraction,
    options: { preferScanFirst: boolean; ackSuffix: string },
  ): Promise<void> {
    if (!isOperator(interaction, this.deps.config)) {
      await interaction.reply({
        content:
          options.preferScanFirst === true
            ? 'Tylko operatorzy testowi mogą uzgadniać panel.'
            : 'Tylko operatorzy testowi mogą publikować panel Centrum.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!interaction.channelId) {
      await interaction.reply({
        content: 'Centrum wymaga kanału tekstowego.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channelId = interaction.channelId;
    const guildId = interaction.guildId ?? this.deps.config.DISCORD_TEST_GUILD_ID;

    const delivered = await executeHubPanelOperation(
      {
        gateway: this.deps.gateway,
        logger: this.deps.logger,
        activityClient: this.deps.activityClient,
      },
      {
        guildId,
        channelId,
        actorDiscordUserId: interaction.user.id,
        organizationId: this.deps.config.ACTIVITY_ORGANIZATION_ID,
        signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
        preferScanFirst: options.preferScanFirst,
      },
    );

    const replyByMode = {
      updated: 'Panel Centrum zaktualizowany w istniejącej wiadomości.',
      adopted: 'Panel uzgodniony — przyjęto istniejącą wiadomość (bez duplikatu).',
      created:
        options.preferScanFirst === true
          ? 'Panel odtworzony — opublikowano nową wiadomość.'
          : 'Panel Centrum opublikowany.',
    } as const;

    await interaction.editReply({ content: replyByMode[delivered.mode] });
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

  private async handleHubModuleSelect(
    interaction: MessageComponentInteraction,
    parsed: Extract<ParsedActivityCustomId, { scope: 'panel' }>,
  ): Promise<void> {
    if (!interaction.isStringSelectMenu()) {
      return;
    }
    const selected = interaction.values[0];
    if (selected === undefined || !isHubModuleKey(selected)) {
      await interaction.reply({
        content: 'Nieznany moduł V2. Odśwież panel Centrum.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const module = getHubModule(selected);

    if (selected === 'activities') {
      await interaction.reply(
        renderHubActivitiesMenu({
          opaquePanelId: parsed.opaqueId,
          signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
        }),
      );
      return;
    }

    if (selected === 'mine') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await this.handlePanelAction(interaction, { ...parsed, action: 'mine' });
      return;
    }

    if (selected === 'notifications') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await this.handlePanelAction(interaction, { ...parsed, action: 'inbox' });
      return;
    }

    if (selected === 'profile') {
      await interaction.reply(renderHubProfileFoundationEphemeral());
      return;
    }

    if (selected === 'for_me') {
      await interaction.reply(renderHubForMeFoundationEphemeral());
      return;
    }

    if (module.availability === 'roadmap' || module.availability === 'disabled') {
      await interaction.reply(renderHubRoadmapEphemeral(selected));
      return;
    }

    await interaction.reply(renderHubRoadmapEphemeral(selected));
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
                payload?: { scheduleLabel?: string; activityName?: string };
              };
              const kindLabel = humanizeInboxKind(row.kind);
              const mark = row.readAt ? '✓' : '•';
              const scheduleLabel =
                typeof row.payload?.scheduleLabel === 'string' ? row.payload.scheduleLabel : null;
              const activityName =
                typeof row.payload?.activityName === 'string' ? row.payload.activityName : null;
              const title =
                scheduleLabel !== null && activityName !== null
                  ? `Termin aktywności ${activityName} zmieniono na: ${scheduleLabel}`
                  : typeof row.title === 'string'
                    ? row.title
                    : typeof row.body === 'string'
                      ? row.body.slice(0, 80)
                      : kindLabel;
              return `${mark} **${kindLabel}** — ${title}`;
            });
      await interaction.editReply(asEditPayload(renderInboxList({ lines })));
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
        {
          statusDefId,
          ...(interaction.guildId !== null ? { guildId: interaction.guildId } : {}),
        },
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
          organizer === null ? 'Brak danych organizatora.' : `Organizator: <@${organizer}>${co}`,
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
      const formState = draftPayloadToFormUiState(payload);
      this.rememberDraftFormUiState(
        interaction.guildId,
        interaction.user.id,
        parsed.opaqueId,
        formState,
      );
      await interaction.editReply(
        asEditPayload(
          renderDraftFormSummary({
            opaqueDraftId: parsed.opaqueId,
            signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
            title: name,
            lines: [
              ...draftSummaryLines(payload),
              '',
              '_Podgląd — wydarzenie nie zostało jeszcze opublikowane._',
            ],
          }),
        ),
      );
      return;
    }

    if (parsed.action === 'publish') {
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      const startRaw = typeof payload.startAt === 'string' ? payload.startAt : '';
      const scheduleKind =
        typeof payload.scheduleKind === 'string' ? payload.scheduleKind : 'exact';
      if (!name || !startRaw) {
        const formState = draftPayloadToFormUiState(payload);
        this.rememberDraftFormUiState(
          interaction.guildId,
          interaction.user.id,
          parsed.opaqueId,
          formState,
        );
        const summary = renderDraftFormSummary({
          opaqueDraftId: parsed.opaqueId,
          signingSecret: this.deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
          title: name || 'Podgląd aktywności',
          lines: [
            'Uzupełnij formularz (nazwa + termin) przed publikacją — kliknij **Edytuj**.',
            ...draftSummaryLines(payload),
          ],
        });
        await interaction.editReply(asEditPayload(summary));
        return;
      }
      const visibility = payload.visibility === 'private' ? 'private' : 'public';
      const recurrenceKind =
        payload.recurrenceKind === 'daily' ||
        payload.recurrenceKind === 'weekly' ||
        payload.recurrenceKind === 'weekdays'
          ? payload.recurrenceKind
          : null;
      const horizonEndAt = typeof payload.horizonEndAt === 'string' ? payload.horizonEndAt : null;
      const privateRoleIds = Array.isArray(payload.privateRoleIds)
        ? payload.privateRoleIds.filter((v): v is string => typeof v === 'string')
        : undefined;

      if (recurrenceKind !== null && horizonEndAt !== null) {
        const seriesPublished = await this.deps.activityClient.publishSeriesDraft(
          draft.id,
          {
            organizationId: this.deps.config.ACTIVITY_ORGANIZATION_ID,
            name,
            firstStartAt: startRaw,
            recurrenceKind,
            horizonEndAt,
            timezone: 'Europe/Warsaw',
            visibility,
            ...(privateRoleIds !== undefined ? { privateRoleIds } : {}),
            ...(typeof payload.description === 'string'
              ? { description: payload.description }
              : {}),
            ...(interaction.channelId !== null
              ? { publicationChannelId: interaction.channelId }
              : {}),
            ...(Array.isArray(payload.weekdays)
              ? {
                  weekdays: payload.weekdays.filter(
                    (v): v is number => typeof v === 'number' && Number.isInteger(v),
                  ),
                }
              : {}),
          },
          {
            ...actorOf(interaction.user.id),
            idempotencyKey: idem(interaction.user.id, 'series-publish', draft.id),
          },
        );
        this.forgetDraftFormUiState(interaction.guildId, interaction.user.id, parsed.opaqueId);
        await interaction.editReply({
          content: `Opublikowano serię **${name}** (${String(seriesPublished.activities.length)} wystąpień).`,
        });
        return;
      }

      const published = await this.deps.activityClient.publishDraft(
        draft.id,
        {
          organizationId: this.deps.config.ACTIVITY_ORGANIZATION_ID,
          name,
          startAt: startRaw,
          scheduleKind,
          timezone: 'Europe/Warsaw',
          visibility,
          ...(privateRoleIds !== undefined ? { privateRoleIds } : {}),
          ...(typeof payload.description === 'string' ? { description: payload.description } : {}),
          ...(typeof payload.endAt === 'string' || payload.endAt === null
            ? { endAt: payload.endAt }
            : {}),
          ...(typeof payload.periodKey === 'string' || payload.periodKey === null
            ? { periodKey: payload.periodKey }
            : {}),
          ...(typeof payload.scheduleHasExplicitTime === 'boolean'
            ? { scheduleHasExplicitTime: payload.scheduleHasExplicitTime }
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
      this.forgetDraftFormUiState(interaction.guildId, interaction.user.id, parsed.opaqueId);
      const privateTokenRaw = (published as { privateInviteToken?: unknown }).privateInviteToken;
      const privateNote =
        visibility === 'private' && typeof privateTokenRaw === 'string'
          ? `\nLink/invite token (pokaż tylko zaufanym): \`${privateTokenRaw}\``
          : '';
      await interaction.editReply({
        content: `Opublikowano **${String(published.name ?? name)}**. Publiczny post pojawi się na kanale aktywności.${privateNote}`,
      });
      return;
    }

    if (parsed.action === 'discard') {
      await this.deps.activityClient.discardDraft(draft.id, {
        ...actorOf(interaction.user.id),
        idempotencyKey: idem(interaction.user.id, 'draft-discard', draft.id),
      });
      this.forgetDraftFormUiState(interaction.guildId, interaction.user.id, parsed.opaqueId);
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
