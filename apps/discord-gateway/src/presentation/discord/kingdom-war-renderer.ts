import {
  ActionRowBuilder,
  ContainerBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  type MessageCreateOptions,
} from 'discord.js';

import type { KingdomWarConfig } from '../../application/technika/capabilities.js';
import { kingdomWarWorkspaceScopeToken } from '../../application/notify/kingdom-war-team-recipients.js';
import { createSignedCustomId } from '../../infrastructure/security/signed-custom-id.js';

/** Compatibility fixture for tests only. Production panels receive the live team roster. */
export const KINGDOM_WAR_CHARACTER_STUB = [
  { id: 'stub-1', name: 'Postać 1' },
  { id: 'stub-2', name: 'Postać 2' },
  { id: 'stub-3', name: 'Postać 3' },
] as const;

const WAR_ACCENT = 0xb42318;
const WAR_SECONDARY = 0x7a271a;

export function renderKingdomWarReminder(input: {
  readonly config: KingdomWarConfig;
  readonly signingSecret: string;
  readonly workspaceId?: string;
  readonly workspaceName?: string;
  readonly selections?: Readonly<Record<string, string>>;
  /** @deprecated compatibility alias */
  readonly claims?: Readonly<Record<string, string>>;
  readonly roster?: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly viewerDiscordUserId?: string;
  readonly actorName?: string;
  readonly actorAction?: string;
}): MessageCreateOptions {
  const roster = [...(input.roster ?? KINGDOM_WAR_CHARACTER_STUB)].slice(0, 25);
  const selections = input.selections ?? input.claims ?? {};
  const workspaceName = input.workspaceName?.trim() || 'Zespół';
  const viewer = input.viewerDiscordUserId ?? '';
  const maxClaims = Math.max(1, Math.min(20, Math.round(input.config.maxClaimsPerUser || 3)));

  const header = new ContainerBuilder().setAccentColor(WAR_ACCENT);
  header.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ⚔️ DESTILED · WOJNA KRÓLESTW\n**Start: ${input.config.warAt} · za 30 minut**\n-# ${workspaceName} · wybory postaci są wspólne dla całego zespołu`,
    ),
  );

  const board = new ContainerBuilder().setAccentColor(WAR_SECONDARY);
  const lines = roster.map((character) => {
    const owner = selections[character.id];
    if (!owner) return `▫️ **${character.name}** — wolna`;
    return owner === viewer
      ? `🟢 **${character.name}** — Twoja`
      : `🔒 **${character.name}** — <@${owner}>`;
  });
  board.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### Skład na wojnę\n${lines.length > 0 ? lines.join('\n') : 'Brak postaci w zespole.'}`,
    ),
  );

  if (input.actorName && input.actorAction) {
    board.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Ostatnia zmiana: ${input.actorName} ${input.actorAction}`),
    );
  }

  const controls = new ContainerBuilder().setAccentColor(WAR_ACCENT);
  const selectable = roster.filter((character) => {
    const owner = selections[character.id];
    return !owner || owner === viewer;
  });
  if (selectable.length > 0 && input.workspaceId && viewer) {
    const scope = kingdomWarWorkspaceScopeToken(input.workspaceId);
    const select = new StringSelectMenuBuilder()
      .setCustomId(createSignedCustomId('war_claim', `wps${scope}`, input.signingSecret))
      .setPlaceholder('Wybierz postacie, które prowadzisz na wojnę')
      .setMinValues(0)
      .setMaxValues(Math.min(maxClaims, selectable.length))
      .addOptions(
        selectable.map((character) => ({
          label: character.name.slice(0, 100),
          value: character.id.slice(0, 100),
          description:
            selections[character.id] === viewer ? 'Wybrana przez Ciebie' : 'Wolna',
          default: selections[character.id] === viewer,
        })),
      );
    controls.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    );
    controls.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Możesz wybrać do ${Math.min(maxClaims, selectable.length)} postaci. Zmiana od razu pojawi się u pozostałych członków zespołu.`,
      ),
    );
  } else {
    controls.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Wszystkie dostępne postacie są już przypisane.'),
    );
  }

  return {
    components: [header, board, controls],
    flags: MessageFlags.IsComponentsV2,
  };
}
