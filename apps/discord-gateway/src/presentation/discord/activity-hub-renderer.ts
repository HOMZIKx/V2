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

const HUB_INTRO = 'Organizuj wieczory, zbieraj ekipę i pilnuj swoich zapisów.';

/**
 * Public Centrum Aktywności hub — one Container, two groups (DZIAŁAJ / TWOJE).
 * No legacy embeds. No lab harness theme. No decorative emoji.
 */
export function renderActivityHubMessage(input: ActivityHubRenderInput): ActivityHubMessagePayload {
  const { opaquePanelId, signingSecret } = input;

  const container = new ContainerBuilder().setAccentColor(ACTIVITY_HUB_ACCENT);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(['## Centrum Aktywności', HUB_INTRO].join('\n')),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
  );
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**DZIAŁAJ**'));
  addHubAction(container, {
    opaquePanelId,
    signingSecret,
    title: 'Utwórz aktywność',
    description: 'Organizujesz wydarzenie dla innych.',
    label: 'Utwórz',
    action: 'create',
  });
  addHubAction(container, {
    opaquePanelId,
    signingSecret,
    title: 'Szukam ekipy',
    description: 'Znajdź ludzi do wspólnej aktywności.',
    label: 'Szukaj',
    action: 'lfg',
  });

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
  );
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**TWOJE**'));
  addHubAction(container, {
    opaquePanelId,
    signingSecret,
    title: 'Moje aktywności',
    description: 'Organizowane, zapisane i najbliższe wydarzenia.',
    label: 'Otwórz',
    action: 'mine',
  });
  addHubAction(container, {
    opaquePanelId,
    signingSecret,
    title: 'Powiadomienia',
    description: 'Zmiany terminów, lista rezerwowa i ważne informacje.',
    label: 'Sprawdź',
    action: 'inbox',
  });

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

function addHubAction(
  container: ContainerBuilder,
  input: {
    opaquePanelId: string;
    signingSecret: string;
    title: string;
    description: string;
    label: string;
    action: 'create' | 'lfg' | 'mine' | 'inbox';
  },
): void {
  const button = new ButtonBuilder()
    .setCustomId(createPanelCustomId(input.opaquePanelId, input.action, input.signingSecret))
    .setLabel(input.label)
    .setStyle(ButtonStyle.Secondary);
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${input.title}**\n${input.description}`),
      )
      .setButtonAccessory(button),
  );
}
