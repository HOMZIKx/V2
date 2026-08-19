import {
  ActionRowBuilder,
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
  buildActivityHubAttachmentFiles,
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
 * Public Centrum Aktywności hub — one Container, thumbnails + action rows.
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

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
  );
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**DZIAŁAJ**'));

  addHubThumbnailSection(container, 'create', {
    title: 'Utwórz aktywność',
    description: 'Organizujesz wydarzenie dla innych.',
  });
  addHubThumbnailSection(container, 'lfg', {
    title: 'Szukam ekipy',
    description: 'Znajdź ludzi do wspólnej aktywności.',
  });
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      hubButton(opaquePanelId, signingSecret, 'Utwórz', 'create'),
      hubButton(opaquePanelId, signingSecret, 'Szukaj', 'lfg'),
    ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
  );
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**TWOJE**'));

  addHubThumbnailSection(container, 'mine', {
    title: 'Moje aktywności',
    description: 'Organizowane, zapisane i najbliższe wydarzenia.',
  });
  addHubThumbnailSection(container, 'notifications', {
    title: 'Powiadomienia',
    description: 'Zmiany terminów, lista rezerwowa i ważne informacje.',
  });
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      hubButton(opaquePanelId, signingSecret, 'Otwórz', 'mine'),
      hubButton(opaquePanelId, signingSecret, 'Sprawdź', 'inbox'),
    ),
  );

  return {
    components: [container],
    files: buildActivityHubAttachmentFiles(),
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

function addHubThumbnailSection(
  container: ContainerBuilder,
  assetKey: 'create' | 'lfg' | 'mine' | 'notifications',
  copy: { title: string; description: string },
): void {
  const asset = getActivityHubAssetDefinition(assetKey);
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${copy.title}**\n${copy.description}`),
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(asset.attachmentUrl).setDescription(asset.alt),
      ),
  );
}
