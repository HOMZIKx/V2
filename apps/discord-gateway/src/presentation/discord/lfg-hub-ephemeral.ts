import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  type InteractionReplyOptions,
} from 'discord.js';

import {
  DEFAULT_CLASS_SPEC_CATALOG,
  DEFAULT_PARTY_ROLE_CATALOG,
  LFG_DUNGEON_ACTIVITY_TYPES,
  formatLfgMatchReason,
  isPartyRoleKey,
  listEnabledClassSpecs,
  type PartyRoleKey,
} from '@v2/hub-core';

import type {
  IdentityProfile,
  IdentityProfileCharacter,
} from '../../infrastructure/identity/identity-http-client.js';
import { createLfgCustomId } from '../../infrastructure/security/lfg-signed-custom-id.js';
import type { LfgMatchCard, LfgTimePreset, LfgWizardState } from './lfg-ui-state-cache.js';
import { formatPolishLocalDateTime } from './localized-datetime.js';

/** Dungeon LFG wizard accent — distinct from hub orange, still V2 premium dark-friendly. */
export const LFG_WIZARD_ACCENT = 0x5c6bc0;

const ALL_ROLES: readonly PartyRoleKey[] = ['TANK', 'BUFF', 'DPS', 'FLEX'];

export type LfgHubRenderInput = {
  readonly opaquePanelId: string;
  readonly signingSecret: string;
  readonly state: LfgWizardState;
  readonly profile: IdentityProfile | null;
  readonly watches?: readonly LfgWatchRow[];
  readonly statusLine?: string;
};

export type LfgWatchRow = {
  readonly id: string;
  readonly activityTypeKey: string;
  readonly sessionRoles: readonly string[];
  readonly windowStartAt?: string;
  readonly windowEndAt?: string;
  readonly expiresAt?: string;
  readonly pausedAt?: string | null;
  readonly cancelledAt?: string | null;
  readonly fulfilledAt?: string | null;
};

export function resolveActiveCharacter(
  profile: IdentityProfile | null,
): IdentityProfileCharacter | null {
  if (profile === null || profile.characters.length === 0) {
    return null;
  }
  if (profile.activeCharacterId !== null) {
    const active = profile.characters.find((entry) => entry.id === profile.activeCharacterId);
    if (active !== undefined) {
      return active;
    }
  }
  return (
    profile.characters.find((entry) => entry.isDefault === true) ?? profile.characters[0] ?? null
  );
}

export function applyProfileCharacter(
  state: LfgWizardState,
  profile: IdentityProfile | null,
  characterId?: string,
): LfgWizardState {
  const character =
    characterId !== undefined
      ? (profile?.characters.find((entry) => entry.id === characterId) ?? null)
      : resolveActiveCharacter(profile);
  if (character === null) {
    return {
      ...state,
      characterId: null,
      characterLabel: null,
      classSpecKey: null,
      characterSupportedRoles: [],
      sessionRoles: [],
    };
  }
  const supported = character.partyRoles.filter(isPartyRoleKey);
  const sessionRoles =
    state.sessionRoles.length > 0
      ? state.sessionRoles.filter((role) => supported.includes(role))
      : supported;
  return {
    ...state,
    characterId: character.id,
    characterLabel: character.nickname,
    classSpecKey: character.classSpecKey,
    characterSupportedRoles: supported,
    sessionRoles: sessionRoles.length > 0 ? sessionRoles : supported,
  };
}

export function toggleSessionRole(state: LfgWizardState, role: PartyRoleKey): LfgWizardState {
  if (!state.characterSupportedRoles.includes(role)) {
    return state;
  }
  const selected = new Set(state.sessionRoles);
  if (selected.has(role)) {
    selected.delete(role);
  } else {
    selected.add(role);
  }
  if (selected.size === 0) {
    return state;
  }
  return {
    ...state,
    sessionRoles: ALL_ROLES.filter((entry) => selected.has(entry)),
  };
}

export function deriveTimeWindow(
  preset: LfgTimePreset,
  now: Date = new Date(),
): { windowStartAt: Date; windowEndAt: Date; label: string } {
  const tzNow = now;
  if (preset === 'now') {
    const start = tzNow;
    const end = new Date(start.getTime() + 2 * 3_600_000);
    return {
      windowStartAt: start,
      windowEndAt: end,
      label: 'Teraz (do 2 h)',
    };
  }
  if (preset === 'plus2h') {
    const start = new Date(tzNow.getTime() + 2 * 3_600_000);
    const end = new Date(start.getTime() + 2 * 3_600_000);
    return {
      windowStartAt: start,
      windowEndAt: end,
      label: 'Za 2 h (okno 2 h)',
    };
  }
  const eveningStart = new Date(tzNow);
  eveningStart.setHours(18, 0, 0, 0);
  if (eveningStart.getTime() <= tzNow.getTime()) {
    eveningStart.setDate(eveningStart.getDate() + 1);
  }
  const eveningEnd = new Date(eveningStart);
  eveningEnd.setHours(23, 0, 0, 0);
  return {
    windowStartAt: eveningStart,
    windowEndAt: eveningEnd,
    label: 'Wieczór (18:00–23:00)',
  };
}

export function mapSearchMatches(
  raw: readonly Record<string, unknown>[],
  dungeonLabel: string,
): LfgMatchCard[] {
  return raw.map((entry) => {
    const reasons = Array.isArray(entry.reasons)
      ? entry.reasons.filter((value): value is string => typeof value === 'string')
      : [];
    const startAt = typeof entry.startAt === 'string' ? entry.startAt : null;
    const occupancy =
      typeof entry.occupancyLabel === 'string'
        ? entry.occupancyLabel
        : typeof entry.occupancy === 'string'
          ? entry.occupancy
          : '—';
    const roleNeedSummary =
      typeof entry.roleNeedSummary === 'string'
        ? entry.roleNeedSummary
        : 'Potrzeby w trakcie ustalania';
    const matchReason =
      typeof entry.matchReason === 'string' ? entry.matchReason : formatLfgMatchReason(reasons);
    return {
      activityId: String(entry.activityId),
      opaqueId:
        typeof entry.opaqueId === 'string' && entry.opaqueId.length > 0
          ? entry.opaqueId
          : String(entry.activityId).replace(/-/g, '').slice(0, 12),
      dungeonLabel:
        typeof entry.dungeonLabel === 'string' && entry.dungeonLabel.length > 0
          ? entry.dungeonLabel
          : dungeonLabel,
      startAtLabel:
        typeof entry.startAtLabel === 'string' && entry.startAtLabel.length > 0
          ? entry.startAtLabel
          : startAt !== null
            ? formatPolishLocalDateTime(new Date(startAt))
            : 'Termin do potwierdzenia',
      occupancyLabel: occupancy,
      roleNeedSummary,
      matchReason,
      ...(typeof entry.fingerprint === 'string' ? { fingerprint: entry.fingerprint } : {}),
    };
  });
}

export function renderLfgHubEphemeral(input: LfgHubRenderInput): InteractionReplyOptions {
  if (input.state.screen === 'my_searches') {
    return renderMySearchesScreen(input);
  }
  if (input.state.screen === 'confirm_create') {
    return renderConfirmCreateScreen(input);
  }
  if (input.state.screen === 'match_view' && input.state.viewedMatchOpaqueId !== null) {
    return renderMatchViewScreen(input);
  }
  return renderWizardScreen(input);
}

function renderWizardScreen(input: LfgHubRenderInput): InteractionReplyOptions {
  const { opaquePanelId, signingSecret, state, profile } = input;
  const dungeon = LFG_DUNGEON_ACTIVITY_TYPES.find((entry) => entry.key === state.dungeonKey);
  const timeLabel =
    state.timePreset === null ? 'Nie wybrano' : deriveTimeWindow(state.timePreset).label;
  const characterLine =
    state.characterLabel !== null
      ? `**${state.characterLabel}** (${state.classSpecKey ?? '?'})`
      : profile === null || profile.characters.length === 0
        ? '_Brak postaci — dodaj szybko poniżej._'
        : '_Wybierz postać._';

  const headerLines = [
    '## Szukam ekipy',
    'Dopasowanie prywatne — bez publicznych ogłoszeń.',
    '',
    `**Dungeon:** ${dungeon?.label ?? 'Nie wybrano'}`,
    `**Postać:** ${characterLine}`,
    `**Role sesji:** ${formatSessionRoles(state.sessionRoles)}`,
    `**Czas:** ${timeLabel}`,
  ];
  if (input.statusLine !== undefined && input.statusLine.length > 0) {
    headerLines.push('', input.statusLine);
  }

  const container = new ContainerBuilder()
    .setAccentColor(LFG_WIZARD_ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerLines.join('\n')))
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );

  const dungeonSelect = new StringSelectMenuBuilder()
    .setCustomId(createLfgCustomId(opaquePanelId, 'dungeon', signingSecret))
    .setPlaceholder(dungeon === undefined ? 'Wybierz dungeon' : dungeon.label)
    .addOptions(
      LFG_DUNGEON_ACTIVITY_TYPES.map((entry) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(entry.label)
          .setValue(entry.key)
          .setDescription(`Dungeon LFG — ${entry.label}`)
          .setDefault(entry.key === state.dungeonKey),
      ),
    );
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(dungeonSelect),
  );

  if (profile !== null && profile.characters.length > 0) {
    const characterSelect = new StringSelectMenuBuilder()
      .setCustomId(createLfgCustomId(opaquePanelId, 'character', signingSecret))
      .setPlaceholder('Zmień postać')
      .addOptions(
        profile.characters.slice(0, 25).map((entry) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(entry.nickname)
            .setValue(entry.id)
            .setDescription(entry.classSpecLabel ?? entry.classSpecKey)
            .setDefault(entry.id === state.characterId),
        ),
      );
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(characterSelect),
    );
  } else {
    const quickAddSelect = new StringSelectMenuBuilder()
      .setCustomId(createLfgCustomId(opaquePanelId, 'quick_add', signingSecret))
      .setPlaceholder('Szybkie dodanie postaci — wybierz klasę/spec')
      .addOptions(
        listEnabledClassSpecs(DEFAULT_CLASS_SPEC_CATALOG)
          .slice(0, 25)
          .map((entry) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(entry.label)
              .setValue(entry.key)
              .setDescription('Utworzy postać z Twoim nickiem Discord'),
          ),
      );
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(quickAddSelect),
    );
  }

  const roleButtons = ALL_ROLES.map((role) => {
    const supported = state.characterSupportedRoles.includes(role);
    const active = state.sessionRoles.includes(role);
    const catalog = DEFAULT_PARTY_ROLE_CATALOG.find((entry) => entry.key === role);
    return new ButtonBuilder()
      .setCustomId(createLfgCustomId(opaquePanelId, 'role', signingSecret, role))
      .setLabel(catalog?.label ?? role)
      .setStyle(active ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(!supported);
  });
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(...roleButtons),
  );

  const timeButtons = [
    { preset: 'now' as const, label: 'Teraz' },
    { preset: 'plus2h' as const, label: '+2 h' },
    { preset: 'evening' as const, label: 'Wieczór' },
  ].map(({ preset, label }) =>
    new ButtonBuilder()
      .setCustomId(createLfgCustomId(opaquePanelId, 'time', signingSecret, preset))
      .setLabel(label)
      .setStyle(state.timePreset === preset ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(...timeButtons),
  );

  const readyToSearch = isWizardReady(state);
  if (readyToSearch && state.matches.length > 0) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(formatMatchesBlock(state.matches, state.showAllMatches)),
    );
    const visibleMatches = state.showAllMatches ? state.matches : state.matches.slice(0, 3);
    for (const match of visibleMatches) {
      container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(createLfgCustomId(opaquePanelId, 'join', signingSecret, match.opaqueId))
            .setLabel('Dołącz')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(createLfgCustomId(opaquePanelId, 'view', signingSecret, match.opaqueId))
            .setLabel('Zobacz')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(
              createLfgCustomId(opaquePanelId, 'suppress', signingSecret, match.opaqueId),
            )
            .setLabel('Nie teraz')
            .setStyle(ButtonStyle.Secondary),
        ),
      );
    }
    if (!state.showAllMatches && state.matches.length > 3) {
      container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(createLfgCustomId(opaquePanelId, 'show_more', signingSecret))
            .setLabel('Pokaż więcej')
            .setStyle(ButtonStyle.Secondary),
        ),
      );
    }
  } else if (readyToSearch) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '### Brak dopasowań',
          'Nie ma teraz otwartej ekipy pasującej do Twoich kryteriów.',
          '',
          '**Znajdź mi ekipę** — powiadomimy Cię prywatnie, gdy pojawi się dopasowanie.',
          '**Utwórz własną** — tylko gdy naprawdę chcesz organizować.',
        ].join('\n'),
      ),
    );
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createLfgCustomId(opaquePanelId, 'watch', signingSecret))
          .setLabel('Znajdź mi ekipę')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(createLfgCustomId(opaquePanelId, 'create', signingSecret))
          .setLabel('Utwórz własną')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  const footerButtons = [
    new ButtonBuilder()
      .setCustomId(createLfgCustomId(opaquePanelId, 'search', signingSecret))
      .setLabel('Szukaj')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!readyToSearch),
    new ButtonBuilder()
      .setCustomId(createLfgCustomId(opaquePanelId, 'my_searches', signingSecret))
      .setLabel('Moje poszukiwania')
      .setStyle(ButtonStyle.Secondary),
  ];
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(...footerButtons),
  );

  return {
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  };
}

function renderMySearchesScreen(input: LfgHubRenderInput): InteractionReplyOptions {
  const { opaquePanelId, signingSecret, watches = [] } = input;
  const active = watches.filter((watch) => watch.cancelledAt == null && watch.fulfilledAt == null);
  const lines =
    active.length === 0
      ? ['_Brak aktywnych poszukiwań._']
      : active.map((watch) => {
          const dungeon =
            LFG_DUNGEON_ACTIVITY_TYPES.find((entry) => entry.key === watch.activityTypeKey)
              ?.label ?? watch.activityTypeKey;
          const paused = watch.pausedAt != null ? ' ⏸ Wstrzymane' : '';
          const window =
            watch.windowStartAt !== undefined && watch.windowEndAt !== undefined
              ? `${formatPolishLocalDateTime(new Date(watch.windowStartAt))} – ${formatPolishLocalDateTime(new Date(watch.windowEndAt))}`
              : 'Okno czasu';
          return `• **${dungeon}** · ${window}${paused}`;
        });

  const container = new ContainerBuilder()
    .setAccentColor(LFG_WIZARD_ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(['## Moje poszukiwania', ...lines].join('\n')),
    );

  for (const watch of active.slice(0, 5)) {
    const paused = watch.pausedAt != null;
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(
            createLfgCustomId(
              opaquePanelId,
              paused ? 'watch_resume' : 'watch_pause',
              signingSecret,
              watch.id,
            ),
          )
          .setLabel(paused ? 'Wznów' : 'Wstrzymaj')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(createLfgCustomId(opaquePanelId, 'watch_cancel', signingSecret, watch.id))
          .setLabel('Anuluj')
          .setStyle(ButtonStyle.Danger),
      ),
    );
  }

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(createLfgCustomId(opaquePanelId, 'back', signingSecret))
        .setLabel('Wróć do wyszukiwania')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return {
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  };
}

function renderConfirmCreateScreen(input: LfgHubRenderInput): InteractionReplyOptions {
  const { opaquePanelId, signingSecret, state } = input;
  const warning =
    state.similarGroupsWarning ??
    'Istnieją podobne otwarte grupy — rozważ dołączenie zamiast tworzenia kolejnej.';

  const container = new ContainerBuilder()
    .setAccentColor(LFG_WIZARD_ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        ['## Utworzyć własną ekipę?', warning, '', 'Kontynuować mimo to?'].join('\n'),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createLfgCustomId(opaquePanelId, 'confirm_create', signingSecret))
          .setLabel('Tak, utwórz własną')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(createLfgCustomId(opaquePanelId, 'back', signingSecret))
          .setLabel('Wróć')
          .setStyle(ButtonStyle.Secondary),
      ),
    );

  return {
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  };
}

function renderMatchViewScreen(input: LfgHubRenderInput): InteractionReplyOptions {
  const { opaquePanelId, signingSecret, state } = input;
  const match = state.matches.find((entry) => entry.opaqueId === state.viewedMatchOpaqueId);
  const body =
    match === undefined
      ? '_Nie znaleziono szczegółów dopasowania._'
      : [
          `**${match.dungeonLabel}**`,
          `Termin: ${match.startAtLabel}`,
          `Zapełnienie: ${match.occupancyLabel}`,
          match.roleNeedSummary,
          `Powód: ${match.matchReason}`,
        ].join('\n');

  const container = new ContainerBuilder()
    .setAccentColor(LFG_WIZARD_ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(['## Szczegóły ekipy', body].join('\n')),
    );

  if (match !== undefined) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createLfgCustomId(opaquePanelId, 'join', signingSecret, match.opaqueId))
          .setLabel('Dołącz')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(createLfgCustomId(opaquePanelId, 'back', signingSecret))
          .setLabel('Wróć')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  } else {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createLfgCustomId(opaquePanelId, 'back', signingSecret))
          .setLabel('Wróć')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  };
}

function formatSessionRoles(roles: readonly PartyRoleKey[]): string {
  if (roles.length === 0) {
    return '_Brak — włącz co najmniej jedną rolę._';
  }
  return roles
    .map((role) => DEFAULT_PARTY_ROLE_CATALOG.find((entry) => entry.key === role)?.label ?? role)
    .join(' · ');
}

function formatMatchesBlock(matches: readonly LfgMatchCard[], showAll: boolean): string {
  const slice = showAll ? matches : matches.slice(0, 3);
  const blocks = slice.map((match, index) =>
    [
      `### ${String(index + 1)}. ${match.dungeonLabel}`,
      `🕒 ${match.startAtLabel} · 👥 ${match.occupancyLabel}`,
      match.roleNeedSummary,
      `_${match.matchReason}_`,
    ].join('\n'),
  );
  return ['### Dopasowania', ...blocks].join('\n\n');
}

export function isWizardReady(state: LfgWizardState): boolean {
  return (
    state.dungeonKey !== null &&
    state.characterId !== null &&
    state.sessionRoles.length > 0 &&
    state.timePreset !== null
  );
}

export function buildLfgSearchBody(input: {
  guildId: string;
  organizationId: string;
  state: LfgWizardState;
}): {
  guildId: string;
  organizationId: string;
  activityTypeKey: string;
  characterClassSpecKey: string;
  characterSupportedRoles: readonly PartyRoleKey[];
  sessionRoles: readonly PartyRoleKey[];
  windowStartAt: string;
  windowEndAt: string;
} | null {
  if (
    !isWizardReady(input.state) ||
    input.state.dungeonKey === null ||
    input.state.classSpecKey === null
  ) {
    return null;
  }
  const preset = input.state.timePreset;
  if (preset === null || preset === 'custom') {
    return null;
  }
  const window = deriveTimeWindow(preset);
  return {
    guildId: input.guildId,
    organizationId: input.organizationId,
    activityTypeKey: input.state.dungeonKey,
    characterClassSpecKey: input.state.classSpecKey,
    characterSupportedRoles: input.state.characterSupportedRoles,
    sessionRoles: input.state.sessionRoles,
    windowStartAt: window.windowStartAt.toISOString(),
    windowEndAt: window.windowEndAt.toISOString(),
  };
}

export function buildLfgWatchBody(input: {
  guildId: string;
  organizationId: string;
  state: LfgWizardState;
}):
  | Parameters<
      import('../../infrastructure/activity/activity-http-client.js').ActivityHttpClient['createLfgWatch']
    >[0]
  | null {
  const searchBody = buildLfgSearchBody(input);
  if (searchBody === null || input.state.characterId === null) {
    return null;
  }
  return {
    guildId: searchBody.guildId,
    organizationId: searchBody.organizationId,
    characterId: input.state.characterId,
    activityTypeKey: searchBody.activityTypeKey,
    sessionRoles: searchBody.sessionRoles,
    windowStartAt: searchBody.windowStartAt,
    windowEndAt: searchBody.windowEndAt,
    ...(searchBody.characterClassSpecKey.length > 0
      ? { classSpecKey: searchBody.characterClassSpecKey }
      : {}),
  };
}
