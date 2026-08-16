import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type MessageCreateOptions,
  type MessageEditOptions,
} from 'discord.js';

import { createPanelCustomId } from '../../infrastructure/security/activity-signed-custom-id.js';
import { ACTIVITY_HUB_ACCENT } from './activity-theme.js';

export { ACTIVITY_HUB_ACCENT } from './activity-theme.js';

export type ActivityHubRenderInput = {
  opaquePanelId: string;
  signingSecret: string;
};

export type ActivityHubMessagePayload = MessageCreateOptions & MessageEditOptions;

/**
 * Public Centrum Aktywności hub — Components V2, one Container, Section+accessory.
 * No legacy embeds. No technical/debug footer (ready/version/SHA).
 */
export function renderActivityHubMessage(input: ActivityHubRenderInput): ActivityHubMessagePayload {
  const { opaquePanelId, signingSecret } = input;

  const container = new ContainerBuilder().setAccentColor(ACTIVITY_HUB_ACCENT);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        '## Centrum Aktywności',
        'Twórz wydarzenia, szukaj ekipy i zarządzaj swoimi zapisami — wszystko na Discordzie.',
      ].join('\n'),
    ),
  );

  const sections: Array<{
    title: string;
    description: string;
    label: string;
    action: 'create' | 'lfg' | 'mine' | 'inbox';
    style: ButtonStyle;
  }> = [
    {
      title: 'Utwórz aktywność',
      description: 'Utwórz wydarzenie, sprawdź podgląd i opublikuj.',
      label: 'Utwórz aktywność',
      action: 'create',
      style: ButtonStyle.Secondary,
    },
    {
      title: 'Szukam ekipy',
      description: 'Szukaj ekipy do wspólnej aktywności.',
      label: 'Szukam ekipy',
      action: 'lfg',
      style: ButtonStyle.Secondary,
    },
    {
      title: 'Moje aktywności',
      description: 'Organizuję, zapisane, najbliższe oraz zakończone.',
      label: 'Moje aktywności',
      action: 'mine',
      style: ButtonStyle.Secondary,
    },
    {
      title: 'Powiadomienia',
      description: 'Zmiany terminu, lista rezerwowa, anulowania i ponowne potwierdzenia.',
      label: 'Powiadomienia',
      action: 'inbox',
      style: ButtonStyle.Secondary,
    },
  ];

  for (const section of sections) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );
    const button = new ButtonBuilder()
      .setCustomId(createPanelCustomId(opaquePanelId, section.action, signingSecret))
      .setLabel(section.label)
      .setStyle(section.style);
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${section.title}**\n${section.description}`),
        )
        .setButtonAccessory(button),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}
