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

/** V2 Centrum module accent — teal, distinct from P1 LAB purple. */
export const ACTIVITY_HUB_ACCENT = 0x0d9488;

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
      description: 'Pełny formularz one-shot z draftem i podglądem.',
      label: 'Utwórz aktywność',
      action: 'create',
      style: ButtonStyle.Primary,
    },
    {
      title: 'Szukam ekipy',
      description: 'Szybka publikacja tej samej aktywności — krótszy flow.',
      label: 'Szukam ekipy',
      action: 'lfg',
      style: ButtonStyle.Secondary,
    },
    {
      title: 'Moje aktywności',
      description: 'Utworzone, zapisane, zakończone i anulowane.',
      label: 'Moje aktywności',
      action: 'mine',
      style: ButtonStyle.Secondary,
    },
    {
      title: 'Powiadomienia',
      description: 'Skrzynka zmian terminu, waitlist, anulowań i reconfirm.',
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
