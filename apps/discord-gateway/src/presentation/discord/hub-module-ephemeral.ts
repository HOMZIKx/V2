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

import { wwwPathForDeepLink, type DeepLink } from '@v2/hub-core';

import type { IdentityProfile } from '../../infrastructure/identity/identity-http-client.js';
import { createPanelCustomId } from '../../infrastructure/security/activity-signed-custom-id.js';
import { ACTIVITY_HUB_ACCENT } from './activity-theme.js';

export type HubProfileWorkspaceInput = {
  readonly opaquePanelId: string;
  readonly signingSecret: string;
  readonly profile: IdentityProfile | null;
  readonly statusLine?: string;
  readonly view?: 'home' | 'characters';
  readonly memberWwwOrigin?: string;
};

function resolveActiveCharacter(profile: IdentityProfile | null) {
  const characters = profile?.characters ?? [];
  const activeId = profile?.activeCharacterId ?? null;
  return activeId !== null
    ? characters.find((entry) => entry.id === activeId)
    : (characters.find((entry) => entry.isDefault === true) ?? characters[0]);
}

function profileWwwUrl(origin: string | undefined, link: DeepLink): string | undefined {
  if (origin === undefined || origin.trim().length === 0) {
    return undefined;
  }
  const base = origin.replace(/\/$/, '');
  return `${base}${wwwPathForDeepLink(link)}`;
}

function renderGroupedCharacters(profile: IdentityProfile): string[] {
  const accounts = profile.gameAccounts ?? [];
  const byAccount = new Map<string, typeof profile.characters>();
  const orphans: typeof profile.characters = [];

  for (const character of profile.characters) {
    const accountId = character.gameAccountId;
    if (accountId === undefined || accountId === null) {
      orphans.push(character);
      continue;
    }
    const list = byAccount.get(accountId) ?? [];
    list.push(character);
    byAccount.set(accountId, list);
  }

  const lines: string[] = [];
  for (const account of accounts) {
    const chars = byAccount.get(account.id) ?? [];
    if (chars.length === 0) {
      continue;
    }
    lines.push(`**${account.displayName}**`);
    for (const entry of chars) {
      lines.push(
        `• ${entry.nickname} · ${entry.classSpecLabel ?? entry.classSpecKey}${
          entry.level !== null && entry.level !== undefined ? ` · ${String(entry.level)}` : ''
        }`,
      );
    }
    lines.push('');
  }
  if (orphans.length > 0) {
    lines.push('**Inne**');
    for (const entry of orphans) {
      lines.push(`• ${entry.nickname}`);
    }
  }
  return lines;
}

/**
 * Real profile workspace — product language only for players.
 */
export function renderHubProfileWorkspace(
  input: HubProfileWorkspaceInput,
): InteractionReplyOptions {
  const characters = input.profile?.characters ?? [];
  const accounts = input.profile?.gameAccounts ?? [];
  const active = resolveActiveCharacter(input.profile);
  const view = input.view ?? 'home';

  const lines =
    view === 'characters'
      ? [
          '## Postacie',
          '',
          characters.length === 0
            ? '_Nie masz jeszcze postaci._'
            : renderGroupedCharacters(input.profile as IdentityProfile).join('\n'),
        ]
      : [
          '## Mój profil',
          '',
          `Postacie: **${String(characters.length)}**`,
          `Konta: **${String(accounts.length)}**`,
          `Aktywna: **${active?.nickname ?? '—'}**`,
        ];

  if (input.statusLine !== undefined && input.statusLine.length > 0) {
    lines.push('', input.statusLine);
  }

  const container = new ContainerBuilder()
    .setAccentColor(ACTIVITY_HUB_ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  if (view === 'home' && characters.length > 0) {
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

  const buttonRow = new ActionRowBuilder<ButtonBuilder>();

  if (view === 'home') {
    buttonRow.addComponents(
      new ButtonBuilder()
        .setCustomId(createPanelCustomId(input.opaquePanelId, 'profile_chars', input.signingSecret))
        .setLabel('Postacie')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(createPanelCustomId(input.opaquePanelId, 'lfg_add', input.signingSecret))
        .setLabel('Dodaj postać')
        .setStyle(ButtonStyle.Primary),
    );
  } else {
    buttonRow.addComponents(
      new ButtonBuilder()
        .setCustomId(createPanelCustomId(input.opaquePanelId, 'profile', input.signingSecret))
        .setLabel('Wróć')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  const wwwProfile =
    input.memberWwwOrigin !== undefined && input.memberWwwOrigin.trim().length > 0
      ? profileWwwUrl(
          input.memberWwwOrigin,
          view === 'characters'
            ? { module: 'profile', objectId: 'me', action: 'characters' }
            : { module: 'profile', objectId: 'me' },
        )
      : undefined;
  if (wwwProfile !== undefined) {
    buttonRow.addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(view === 'characters' ? 'Zarządzaj kontami na WWW' : 'Otwórz profil WWW')
        .setURL(wwwProfile),
    );
  }

  buttonRow.addComponents(
    new ButtonBuilder()
      .setCustomId(createPanelCustomId(input.opaquePanelId, 'inbox', input.signingSecret))
      .setLabel('Powiadomienia')
      .setStyle(ButtonStyle.Secondary),
  );

  container.addActionRowComponents(buttonRow);

  return {
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  };
}

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
