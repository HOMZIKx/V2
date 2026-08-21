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

import { HUB_GROUP_LABELS, listHubModulesForSelect, type HubModuleDefinition } from '@v2/hub-core';

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
  /** Optional override of registry modules (tests / Admin-disabled modules). */
  modules?: readonly HubModuleDefinition[];
};

export type ActivityHubMessagePayload = MessageCreateOptions & MessageEditOptions;

const HUB_TITLE = 'V2 Centrum';
const HUB_INTRO =
  'Potrzebujesz czegoś związanego z grą lub społecznością — zacznij tutaj. Wybierz obszar z listy.';
const SELECT_PLACEHOLDER = 'Nie wybrano żadnej opcji';

/**
 * Canonical V2 Hub — one Components V2 Container + native StringSelect navigation.
 * Personalized flows continue in ephemeral / DM / WWW — never in this public message.
 */
export function renderActivityHubMessage(input: ActivityHubRenderInput): ActivityHubMessagePayload {
  const { opaquePanelId, signingSecret } = input;
  const modules = listHubModulesForSelect(input.modules);

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

  const groupLines = (['GRA', 'RYNEK', 'GILDIA', 'TY'] as const).map((group) => {
    const labels = modules
      .filter((module) => module.group === group)
      .map((module) => module.label)
      .join(' · ');
    return `**${HUB_GROUP_LABELS[group]}** — ${labels.length > 0 ? labels : '—'}`;
  });
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(['**Mapa V2**', ...groupLines].join('\n')),
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(createPanelCustomId(opaquePanelId, 'module', signingSecret))
    .setPlaceholder(SELECT_PLACEHOLDER)
    .addOptions(
      modules.map((module) => {
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(module.label)
          .setValue(module.discord.selectValue)
          .setDescription(selectDescription(module));
        return option;
      }),
    );

  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '-# Wybór otwiera prywatny flow. Ten kanał nie jest miejscem na rozmowę.',
    ),
  );

  return {
    components: [container],
    files: buildActivityHubMessageAttachmentFiles(),
    flags: MessageFlags.IsComponentsV2,
  };
}

function selectDescription(module: HubModuleDefinition): string {
  const availabilityLabel =
    module.availability === 'available'
      ? 'Dostępne'
      : module.availability === 'foundation'
        ? 'Fundament'
        : 'Wkrótce';
  const base = `${HUB_GROUP_LABELS[module.group]} · ${availabilityLabel}`;
  return base.slice(0, 100);
}
