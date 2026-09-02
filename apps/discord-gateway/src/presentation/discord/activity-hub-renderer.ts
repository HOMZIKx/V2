import {
  ActionRowBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type MessageCreateOptions,
  type MessageEditOptions,
} from 'discord.js';

import {
  HUB_CENTRUM_SECTION_LABELS,
  listHubCentrumSelectOptions,
  listRoadmapModuleLabels,
  type HubCentrumSelectOption,
} from '@v2/hub-core';

import { createPanelCustomId } from '../../infrastructure/security/activity-signed-custom-id.js';
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
  /** Optional override of Centrum select options (tests). */
  options?: readonly HubCentrumSelectOption[];
};

export type ActivityHubMessagePayload = MessageCreateOptions & MessageEditOptions;

const HUB_TITLE = 'V2 Centrum';
const HUB_INTRO = 'Wybierz działanie — otworzy się prywatny widok tylko dla Ciebie.';
const SELECT_PLACEHOLDER = 'Wybierz działanie';

/**
 * Canonical V2 Hub — one Components V2 Container + native StringSelect.
 * Direct player actions only; roadmap modules are never interactive.
 */
export function renderActivityHubMessage(input: ActivityHubRenderInput): ActivityHubMessagePayload {
  const { opaquePanelId, signingSecret } = input;
  const options = listHubCentrumSelectOptions(input.options);

  const container = new ContainerBuilder().setAccentColor(ACTIVITY_HUB_ACCENT);

  const hubAsset = getActivityHubAssetDefinition('activityHub');
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(['## ' + HUB_TITLE, HUB_INTRO].join('\n')),
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

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  );

  const graLabels = options
    .filter((option) => option.section === 'GRA')
    .map((option) => option.label)
    .join(' · ');
  const youLabels = options
    .filter((option) => option.section === 'DLA_CIEBIE')
    .map((option) => option.label)
    .join(' · ');
  const roadmap = listRoadmapModuleLabels();
  const soonLine = roadmap.length > 0 ? `\n_Wkrótce: ${roadmap.join(' · ')}_` : '';

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `**${HUB_CENTRUM_SECTION_LABELS.GRA}**`,
        graLabels,
        '',
        `**${HUB_CENTRUM_SECTION_LABELS.DLA_CIEBIE}**`,
        youLabels,
        soonLine,
      ]
        .filter((line) => line.length > 0)
        .join('\n'),
    ),
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(createPanelCustomId(opaquePanelId, 'module', signingSecret))
    .setPlaceholder(SELECT_PLACEHOLDER)
    .addOptions(
      options.map((option) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(option.label)
          .setValue(option.value)
          .setDescription(option.description.slice(0, 100)),
      ),
    );

  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '-# Wybór otwiera prywatny widok. Ten kanał nie jest miejscem na rozmowę.',
    ),
  );

  return {
    components: [container],
    files: buildActivityHubMessageAttachmentFiles(),
    flags: MessageFlags.IsComponentsV2,
  };
}
