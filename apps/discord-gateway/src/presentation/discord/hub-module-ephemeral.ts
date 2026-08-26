import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  type InteractionReplyOptions,
} from 'discord.js';

import type { IdentityProfile } from '../../infrastructure/identity/identity-http-client.js';
import { createPanelCustomId } from '../../infrastructure/security/activity-signed-custom-id.js';
import { ACTIVITY_HUB_ACCENT } from './activity-theme.js';

export type HubProfileWorkspaceInput = {
  readonly opaquePanelId: string;
  readonly signingSecret: string;
  readonly profile: IdentityProfile | null;
  readonly statusLine?: string;
};

export type HubForMeWorkspaceInput = {
  readonly opaquePanelId: string;
  readonly signingSecret: string;
  readonly items?: readonly HubForMeItem[];
};

export type HubForMeItem = {
  readonly title: string;
  readonly detail: string;
  readonly reason: string;
};

/**
 * Real profile workspace — product language only for players.
 */
export function renderHubProfileWorkspace(
  input: HubProfileWorkspaceInput,
): InteractionReplyOptions {
  const characters = input.profile?.characters ?? [];
  const activeId = input.profile?.activeCharacterId ?? null;
  const active =
    activeId !== null ? characters.find((entry) => entry.id === activeId) : characters[0];
  const activeLine =
    active !== undefined
      ? `${active.nickname} · ${active.classSpecLabel ?? active.classSpecKey}${
          active.level !== null && active.level !== undefined ? ` · ${String(active.level)}` : ''
        }`
      : '_Brak aktywnej postaci_';

  const listLines =
    characters.length === 0
      ? ['_Nie masz jeszcze postaci._']
      : characters.slice(0, 12).map((entry) => {
          const mark = entry.id === active?.id ? '★ ' : '• ';
          return `${mark}${entry.nickname} · ${entry.classSpecLabel ?? entry.classSpecKey}`;
        });

  const interests =
    input.profile !== null && input.profile.interestKeys.length > 0
      ? input.profile.interestKeys.join(' · ')
      : '_Brak ustawionych zainteresowań_';

  const lines = [
    '## Mój profil',
    '',
    '**Aktywna postać**',
    activeLine,
    '',
    '**Twoje postacie**',
    ...listLines,
    '',
    '**Zainteresowania**',
    interests,
    '',
    '**Powiadomienia**',
    'Zarządzaj skrzynką z Centrum → Powiadomienia.',
  ];
  if (input.statusLine !== undefined && input.statusLine.length > 0) {
    lines.push('', input.statusLine);
  }

  const container = new ContainerBuilder()
    .setAccentColor(ACTIVITY_HUB_ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  if (characters.length > 0) {
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(createPanelCustomId(input.opaquePanelId, 'profile_set', input.signingSecret))
          .setPlaceholder('Zmień aktywną postać')
          .addOptions(
            characters.slice(0, 25).map((entry) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(entry.nickname.slice(0, 100))
                .setDescription((entry.classSpecLabel ?? entry.classSpecKey).slice(0, 100))
                .setValue(entry.id)
                .setDefault(entry.id === active?.id),
            ),
          ),
      ),
    );
  }

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(createPanelCustomId(input.opaquePanelId, 'lfg_add', input.signingSecret))
        .setLabel('Dodaj postać')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(createPanelCustomId(input.opaquePanelId, 'inbox', input.signingSecret))
        .setLabel('Powiadomienia')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return {
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  };
}

export function renderHubForMeWorkspace(input: HubForMeWorkspaceInput): InteractionReplyOptions {
  const items = input.items ?? [];
  const body =
    items.length === 0
      ? [
          '## Dla mnie',
          'Rzeczy, które mogą Cię zainteresować.',
          '',
          'Na razie nic nowego.',
          'Gdy pojawi się coś pasującego do Twoich postaci,',
          'zainteresowań lub obserwacji, zobaczysz to tutaj.',
        ]
      : [
          '## Dla mnie',
          'Rzeczy, które mogą Cię zainteresować.',
          '',
          ...items.flatMap((item) => [`**${item.title}**`, item.detail, `_${item.reason}_`, '']),
        ];

  const container = new ContainerBuilder()
    .setAccentColor(ACTIVITY_HUB_ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body.join('\n')));

  return {
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  };
}
