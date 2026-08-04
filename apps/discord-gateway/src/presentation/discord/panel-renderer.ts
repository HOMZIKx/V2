import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  type InteractionReplyOptions,
  type MessageCreateOptions,
  type MessageEditOptions,
} from 'discord.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createSignedCustomId,
  PANEL_VERSION,
  panelPayload,
} from '../../infrastructure/security/signed-custom-id.js';
import {
  PANEL_DESCRIPTION,
  PANEL_FOOTER_PREFIX,
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

export type PanelRenderInput = {
  signingSecret: string;
  connectionState: string;
  environment: string;
  includeBanner?: boolean;
};

export type PanelMessagePayload = MessageCreateOptions & MessageEditOptions;

export function renderPanelMessage(input: PanelRenderInput): PanelMessagePayload {
  const payload = panelPayload();
  const embed = new EmbedBuilder()
    .setColor(V2_PANEL_COLORS.embed)
    .setTitle(PANEL_TITLE)
    .setDescription(PANEL_DESCRIPTION)
    .addFields(
      {
        name: 'Stan połączenia',
        value: `\`${input.connectionState}\``,
        inline: true,
      },
      {
        name: 'Środowisko',
        value: `\`${input.environment}\``,
        inline: true,
      },
      {
        name: 'Wersja panelu',
        value: `\`${PANEL_VERSION}\``,
        inline: true,
      },
    )
    .setFooter({ text: `${PANEL_FOOTER_PREFIX} • panel ${PANEL_VERSION}` })
    .setTimestamp(new Date());

  if (input.includeBanner !== false) {
    embed.setImage('attachment://v2-lab-banner.png');
  }

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

  const files =
    input.includeBanner === false
      ? []
      : [
          new AttachmentBuilder(readFileSync(resolveBannerPath()), {
            name: 'v2-lab-banner.png',
          }),
        ];

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      new ActionRowBuilder<ButtonBuilder>().addComponents(refresh, remove),
    ],
    files,
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
    .setFooter({ text: `${PANEL_FOOTER_PREFIX} • status` })
    .setTimestamp(new Date());
}
