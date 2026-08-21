import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  type InteractionReplyOptions,
} from 'discord.js';

import {
  DEFAULT_CLASS_SPEC_CATALOG,
  DEFAULT_PARTY_ROLE_CATALOG,
  getHubModule,
  type HubModuleKey,
} from '@v2/hub-core';

import { createPanelCustomId } from '../../infrastructure/security/activity-signed-custom-id.js';
import { ACTIVITY_HUB_ACCENT } from './activity-theme.js';

export function renderHubRoadmapEphemeral(moduleKey: HubModuleKey): InteractionReplyOptions {
  const module = getHubModule(moduleKey);
  return {
    content: [
      `## ${module.label}`,
      module.description,
      '',
      '_Moduł jest na roadmapie. Shell V2 już go zna — pełna funkcja przyjdzie w kolejnym etapie._',
    ].join('\n'),
    flags: MessageFlags.Ephemeral,
  };
}

export function renderHubProfileFoundationEphemeral(): InteractionReplyOptions {
  const classes = DEFAULT_CLASS_SPEC_CATALOG.filter((entry) => entry.enabled)
    .slice(0, 6)
    .map((entry) => `• ${entry.label}`)
    .join('\n');
  const roles = DEFAULT_PARTY_ROLE_CATALOG.map((entry) => entry.label).join(' · ');
  return {
    content: [
      '## Mój profil',
      'Fundament profilu V2 (Discord + WWW + LFG).',
      '',
      '**Zakres fundamentu**',
      '• tożsamość użytkownika V2',
      '• jedna lub wiele postaci + aktywna postać',
      '• nickname, klasa/spec, opcjonalny poziom',
      '• role party (osobno od klasy/spec)',
      '• zainteresowania (SoT V2; ≠ rola Discord ≠ powiadomienia)',
      '',
      '**Katalog klasy/spec (fragment)**',
      classes,
      '',
      `**Role party:** ${roles}`,
      '',
      '_Edycja WWW: /profil — pełna synchronizacja ról Discord w kolejnych iteracjach Hub Core._',
    ].join('\n'),
    flags: MessageFlags.Ephemeral,
  };
}

export function renderHubForMeFoundationEphemeral(): InteractionReplyOptions {
  return {
    content: [
      '## Dla mnie',
      'Spersonalizowany widok trafień — każdy element powinien mieć powód.',
      '',
      'Przykłady powodów:',
      '• bo obserwujesz X',
      '• bo jesteś w Y',
      '• bo organizujesz Z',
      '• bo LFG pasuje do Twojej postaci',
      '',
      '_Na razie brak pozycji. Moduły będą dokładać trafienia wraz z wdrożeniem._',
    ].join('\n'),
    flags: MessageFlags.Ephemeral,
  };
}

export function renderHubActivitiesMenu(input: {
  opaquePanelId: string;
  signingSecret: string;
}): InteractionReplyOptions {
  const create = new ButtonBuilder()
    .setCustomId(createPanelCustomId(input.opaquePanelId, 'create', input.signingSecret))
    .setLabel('Utwórz')
    .setStyle(ButtonStyle.Secondary);
  const lfg = new ButtonBuilder()
    .setCustomId(createPanelCustomId(input.opaquePanelId, 'lfg', input.signingSecret))
    .setLabel('Szukam ekipy')
    .setStyle(ButtonStyle.Secondary);

  const container = new ContainerBuilder()
    .setAccentColor(ACTIVITY_HUB_ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '## Aktywności',
          'Organizuj wydarzenia i zbieraj ekipę.',
          '',
          '**Szukam ekipy** = matching (postać → role → okno czasu → dopasowania),',
          'nie tablica publicznych postów.',
          '',
          'Kolejność: dopasuj istniejące → Znajdź mi ekipę → dopiero potem Utwórz.',
        ].join('\n'),
      ),
    )
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(lfg, create));

  return {
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  };
}
