import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
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
  hubActionIconPrefix,
  resolveHubActionEmojisFromEnv,
  type HubActionEmojiMap,
  type HubActionKey,
} from './activity-hub-action-emojis.js';
import {
  buildActivityHubMessageAttachmentFiles,
  getActivityHubAssetDefinition,
  isActivityHubAssetAvailable,
} from './activity-hub-assets.js';
import { ACTIVITY_HUB_ACCENT } from './activity-theme.js';

export { ACTIVITY_HUB_ACCENT } from './activity-theme.js';

export type ActivityHubRenderInput = {
  opaquePanelId: string;
  signingSecret: string;
  /** Optional override; defaults to DISCORD_ACTIVITY_HUB_ACTION_EMOJIS_JSON. */
  actionEmojis?: HubActionEmojiMap;
};

export type ActivityHubMessagePayload = MessageCreateOptions & MessageEditOptions;

const HUB_INTRO = 'Organizuj wydarzenia i zbieraj ekipę.';

/**
 * Public Centrum Aktywności hub — one Components V2 Container.
 * Header thumbnail + optional wide MediaGallery banner + four Section buttons.
 * Action icons are emoji-scale (custom emoji config) — never large ThumbnailAccessory.
 */
export function renderActivityHubMessage(input: ActivityHubRenderInput): ActivityHubMessagePayload {
  const { opaquePanelId, signingSecret } = input;
  const actionEmojis = input.actionEmojis ?? resolveHubActionEmojisFromEnv();

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

  if (isActivityHubAssetAvailable('activityBanner')) {
    const banner = getActivityHubAssetDefinition('activityBanner');
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(banner.attachmentUrl).setDescription(banner.alt),
      ),
    );
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**DZIAŁAJ**'));

  addHubActionSection(container, opaquePanelId, signingSecret, actionEmojis, {
    title: 'Utwórz aktywność',
    description: 'Zaplanuj wydarzenie dla innych.',
    label: 'Utwórz',
    action: 'create',
  });
  addHubActionSection(container, opaquePanelId, signingSecret, actionEmojis, {
    title: 'Szukam ekipy',
    description: 'Znajdź aktywną ekipę.',
    label: 'Szukaj',
    action: 'lfg',
  });

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  );
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**TWOJE**'));

  addHubActionSection(container, opaquePanelId, signingSecret, actionEmojis, {
    title: 'Moje aktywności',
    description: 'Twoje wydarzenia i zapisy.',
    label: 'Otwórz',
    action: 'mine',
  });
  addHubActionSection(container, opaquePanelId, signingSecret, actionEmojis, {
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
  action: HubActionKey,
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
  actionEmojis: HubActionEmojiMap,
  copy: {
    title: string;
    description: string;
    label: string;
    action: HubActionKey;
  },
): void {
  const icon = hubActionIconPrefix(copy.action, actionEmojis);
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${icon}${copy.title}**\n${copy.description}`),
      )
      .setButtonAccessory(hubButton(opaquePanelId, signingSecret, copy.label, copy.action)),
  );
}
