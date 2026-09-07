import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  EmbedBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  type InteractionReplyOptions,
  type MessageCreateOptions,
  type MessageEditOptions,
} from 'discord.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolvePanelButtonMetaStore } from '../../application/technika/panel-button-meta.js';
import {
  createSignedCustomId,
  HUB_ACTION_TO_CUSTOM,
  hubEphemPayload,
  panelPayload,
  type ComponentAction,
} from '../../infrastructure/security/signed-custom-id.js';
import {
  accentHexToInt,
  HUB_ACTION_LABELS,
  type PanelCustomButton,
  type PanelHubActionId,
  type PanelPublishAppearance,
} from './panel-publish-appearance.js';
import {
  PANEL_DESCRIPTION,
  PANEL_FOOTER,
  PANEL_TITLE,
  SELECT_OPTIONS,
  SELECT_PLACEHOLDER,
  V2_PANEL_COLORS,
} from './panel-theme.js';

function resolveBannerPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), 'apps/discord-gateway/assets/v2-lab-banner.png'),
    path.resolve(process.cwd(), 'assets/v2-lab-banner.png'),
    path.resolve(here, '../../../assets/v2-lab-banner.png'),
    path.resolve(here, '../../../../assets/v2-lab-banner.png'),
  ];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error(
    'Missing apps/discord-gateway/assets/v2-lab-banner.png. Run: node apps/discord-gateway/scripts/generate-banner.mjs',
  );
}

function styleToDiscord(style: PanelCustomButton['style']): ButtonStyle {
  if (style === 'primary') return ButtonStyle.Primary;
  if (style === 'danger') return ButtonStyle.Danger;
  return ButtonStyle.Secondary;
}

function chunkButtons<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export type PanelRenderInput = {
  signingSecret: string;
  includeBanner?: boolean;
  title?: string;
  description?: string;
  accentHex?: string;
  bannerUrl?: string;
  enabledActions?: readonly PanelHubActionId[];
  customButtons?: readonly PanelCustomButton[];
  /** When true (default for lab), keep select + refresh/delete. Centrum publish sets false implicitly via enabledActions. */
  labControls?: boolean;
};

export type PanelMessagePayload = MessageCreateOptions & MessageEditOptions;

export function appearanceToRenderInput(
  signingSecret: string,
  appearance: PanelPublishAppearance,
): PanelRenderInput {
  const input: PanelRenderInput = {
    signingSecret,
    labControls: appearance.enabledActions === undefined,
  };
  if (typeof appearance.includeBanner === 'boolean') input.includeBanner = appearance.includeBanner;
  if (appearance.title) input.title = appearance.title;
  if (appearance.description !== undefined) input.description = appearance.description;
  if (appearance.accentHex) input.accentHex = appearance.accentHex;
  if (appearance.bannerUrl) input.bannerUrl = appearance.bannerUrl;
  if (appearance.enabledActions) input.enabledActions = appearance.enabledActions;
  if (appearance.customButtons) input.customButtons = appearance.customButtons;
  return input;
}

/**
 * Public panel as Discord Components V2 (single Container).
 * Honors Technika publish contract: title, description, accentHex,
 * includeBanner, bannerUrl, enabledActions, customButtons.
 */
export function renderPanelMessage(input: PanelRenderInput): PanelMessagePayload {
  const payload = panelPayload();
  const title = input.title?.trim() || PANEL_TITLE;
  const description = input.description !== undefined ? input.description : PANEL_DESCRIPTION;
  const accent = accentHexToInt(input.accentHex) ?? V2_PANEL_COLORS.embed;
  const includeBanner = input.includeBanner !== false;
  const externalBanner =
    includeBanner && typeof input.bannerUrl === 'string' && /^https?:\/\//i.test(input.bannerUrl)
      ? input.bannerUrl
      : null;
  const useLabControls = input.labControls !== false && input.enabledActions === undefined;
  const hubActions = input.enabledActions ?? [];
  const customButtons = input.customButtons ?? [];

  const container = new ContainerBuilder().setAccentColor(accent);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      description.trim().length > 0 ? `## ${title}\n${description}` : `## ${title}`,
    ),
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  );

  const files: AttachmentBuilder[] = [];
  if (includeBanner && externalBanner) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(externalBanner)),
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );
  } else if (includeBanner) {
    files.push(
      new AttachmentBuilder(readFileSync(resolveBannerPath()), {
        name: 'v2-lab-banner.png',
      }),
    );
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://v2-lab-banner.png'),
      ),
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );
  }

  // Hub enabledActions → signed hub_* buttons
  const hubBuilders: ButtonBuilder[] = [];
  for (const actionId of hubActions) {
    const customAction = HUB_ACTION_TO_CUSTOM[actionId];
    if (!customAction) continue;
    hubBuilders.push(
      new ButtonBuilder()
        .setCustomId(createSignedCustomId(customAction, payload, input.signingSecret))
        .setLabel(HUB_ACTION_LABELS[actionId])
        .setStyle(
          actionId === 'create' || actionId === 'lfg' ? ButtonStyle.Primary : ButtonStyle.Secondary,
        ),
    );
  }
  for (const row of chunkButtons(hubBuilders, 5)) {
    container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(...row));
  }

  // customButtons
  const meta = resolvePanelButtonMetaStore();
  const customBuilders: ButtonBuilder[] = [];
  for (const btn of customButtons) {
    if (btn.action === 'url') {
      if (!btn.url || !/^https?:\/\//i.test(btn.url)) continue;
      customBuilders.push(
        new ButtonBuilder().setLabel(btn.label).setStyle(ButtonStyle.Link).setURL(btn.url),
      );
      continue;
    }
    if (btn.action === 'ephemeral_text') {
      meta.putEphemeral(btn.id, btn.ephemeralText ?? '…');
      customBuilders.push(
        new ButtonBuilder()
          .setCustomId(
            createSignedCustomId('hub_ephem', hubEphemPayload(btn.id), input.signingSecret),
          )
          .setLabel(btn.label)
          .setStyle(styleToDiscord(btn.style)),
      );
      continue;
    }
    const customAction = HUB_ACTION_TO_CUSTOM[btn.action] as ComponentAction | undefined;
    if (!customAction) continue;
    customBuilders.push(
      new ButtonBuilder()
        .setCustomId(createSignedCustomId(customAction, payload, input.signingSecret))
        .setLabel(btn.label)
        .setStyle(styleToDiscord(btn.style)),
    );
  }
  for (const row of chunkButtons(customBuilders, 5)) {
    container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(...row));
  }

  if (useLabControls) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(createSignedCustomId('select', payload, input.signingSecret))
      .setPlaceholder(SELECT_PLACEHOLDER)
      .addOptions(
        SELECT_OPTIONS.map((option) => ({
          label: option.label,
          value: option.value,
          description: option.description,
          emoji: option.emoji,
        })),
      );
    const refresh = new ButtonBuilder()
      .setCustomId(createSignedCustomId('refresh', payload, input.signingSecret))
      .setLabel('Odśwież')
      .setStyle(ButtonStyle.Secondary);
    const remove = new ButtonBuilder()
      .setCustomId(createSignedCustomId('delete_ask', payload, input.signingSecret))
      .setLabel('Usuń panel')
      .setStyle(ButtonStyle.Danger);
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    );
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(refresh, remove),
    );
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${PANEL_FOOTER}`));

  return {
    components: [container],
    files,
    flags: MessageFlags.IsComponentsV2,
  };
}

export function renderDeleteConfirmation(
  signingSecret: string,
  panelMessageId: string,
): InteractionReplyOptions {
  const payload = `${panelPayload()}m${panelMessageId}`;
  return {
    content:
      'Usunąć ten panel testowy? To działanie jest destrukcyjne i nie tworzy nowej publicznej wiadomości.',
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createSignedCustomId('delete_confirm', payload, signingSecret))
          .setLabel('Potwierdź usunięcie')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(createSignedCustomId('delete_cancel', payload, signingSecret))
          .setLabel('Anuluj')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  };
}

export function buildStatusEmbed(input: {
  state: string;
  guildId: string;
  uptimeSeconds: number;
  pingMs: number | null;
  version: string;
  commitSha: string;
  commandsRegistered: boolean;
}) {
  return new EmbedBuilder()
    .setColor(V2_PANEL_COLORS.success)
    .setTitle('V2 LAB • STATUS')
    .setDescription('Bezpieczny status harnessu Discord (ephemeral).')
    .addFields(
      { name: 'Połączenie', value: `\`${input.state}\``, inline: true },
      { name: 'Środowisko', value: '`test`', inline: true },
      { name: 'Wersja', value: `\`${input.version}\``, inline: true },
      { name: 'Commit', value: `\`${input.commitSha}\``, inline: true },
      { name: 'Uptime', value: `\`${input.uptimeSeconds}s\``, inline: true },
      {
        name: 'Ping',
        value: input.pingMs === null ? '`n/a`' : `\`${input.pingMs}ms\``,
        inline: true,
      },
      { name: 'Guild', value: `\`${input.guildId}\``, inline: false },
      {
        name: 'Rejestr komend',
        value: input.commandsRegistered ? '`ok`' : '`unknown`',
        inline: true,
      },
    )
    .setFooter({ text: 'V2 • TEST • status' })
    .setTimestamp(new Date());
}
