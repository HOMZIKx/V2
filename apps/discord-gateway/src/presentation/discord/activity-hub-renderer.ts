import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type MessageCreateOptions,
  type MessageEditOptions,
} from 'discord.js';

import { createPanelCustomId } from '../../infrastructure/security/activity-signed-custom-id.js';
import {
  buildActivityHubMessageAttachmentFiles,
  getActivityHubAssetDefinition,
} from './activity-hub-assets.js';
import { ACTIVITY_HUB_ACCENT } from './activity-theme.js';

export { ACTIVITY_HUB_ACCENT } from './activity-theme.js';

export type ActivityHubRenderInput = {
  opaquePanelId: string;
  signingSecret: string;
};

export type ActivityHubMessagePayload = MessageCreateOptions & MessageEditOptions;

const HUB_INTRO = 'Organizuj wieczory, zbieraj ekipę i pilnuj swoich zapisów.';

/**
 * Public Centrum Aktywności hub — one compact Container.
 * Header thumbnail only; each action is a Section with a Secondary button accessory.
 * No legacy embeds. No lab harness theme. No decorative emoji.
 */
export function renderActivityHubMessage(input: ActivityHubRenderInput): ActivityHubMessagePayload {
  const { opaquePanelId, signingSecret } = input;

  const container = new ContainerBuilder().setAccentColor(ACTIVITY_HUB_ACCENT);

  const hubAsset = getActivityHubAssetDefinition('activityHub');
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(['## Centrum Aktywności', HUB_INTRO].join('\n')),
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(hubAsset.attachmentUrl).setDescription(hubAsset.alt),
      ),
  );

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**DZIAŁAJ**'));

  addHubActionSection(container, opaquePanelId, signingSecret, {
    title: 'Utwórz aktywność',
    description: 'Zaplanuj wydarzenie dla innych.',
    label: 'Utwórz',
    action: 'create',
  });
  addHubActionSection(container, opaquePanelId, signingSecret, {
    title: 'Szukam ekipy',
    description: 'Znajdź aktywną ekipę.',
    label: 'Szukaj',
    action: 'lfg',
  });

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  );
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**TWOJE**'));

  addHubActionSection(container, opaquePanelId, signingSecret, {
    title: 'Moje aktywności',
    description: 'Twoje wydarzenia i zapisy.',
    label: 'Otwórz',
    action: 'mine',
  });
  addHubActionSection(container, opaquePanelId, signingSecret, {
    title: 'Powiadomienia',
    description: 'Zmiany, przypomnienia i lista rezerwowa.',
    label: 'Otwórz',
    action: 'inbox',
  });

  return {
    components: [container],
    files: buildActivityHubMessageAttachmentFiles(),
    flags: MessageFlags.IsComponentsV2,
  };
}

function hubButton(
  opaquePanelId: string,
  signingSecret: string,
  label: string,
  action: 'create' | 'lfg' | 'mine' | 'inbox',
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(createPanelCustomId(opaquePanelId, action, signingSecret))
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary);
}

function addHubActionSection(
  container: ContainerBuilder,
  opaquePanelId: string,
  signingSecret: string,
  copy: {
    title: string;
    description: string;
    label: string;
    action: 'create' | 'lfg' | 'mine' | 'inbox';
  },
): void {
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${copy.title}**\n${copy.description}`),
      )
      .setButtonAccessory(hubButton(opaquePanelId, signingSecret, copy.label, copy.action)),
  );
}
