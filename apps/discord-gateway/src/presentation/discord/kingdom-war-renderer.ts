import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageCreateOptions,
} from 'discord.js';

import { applyMessageTemplate, computeNotifyAt } from '../../application/config/live-bot-config.js';
import type { KingdomWarConfig } from '../../application/technika/capabilities.js';
import { createSignedCustomId } from '../../infrastructure/security/signed-custom-id.js';

/** Stub roster until the player/team character source is wired into war reminders. */
export const KINGDOM_WAR_CHARACTER_STUB = [
  { id: 'stub-1', name: 'Postać 1 · deklaracja na wojnę' },
  { id: 'stub-2', name: 'Postać 2 · deklaracja na wojnę' },
  { id: 'stub-3', name: 'Postać 3 · deklaracja na wojnę' },
  { id: 'stub-4', name: 'Postać 4 · deklaracja na wojnę' },
  { id: 'stub-5', name: 'Postać 5 · deklaracja na wojnę' },
] as const;

function buttonLabel(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= 70 ? trimmed : `${trimmed.slice(0, 67)}…`;
}

export function renderKingdomWarReminder(input: {
  readonly config: KingdomWarConfig;
  readonly signingSecret: string;
  readonly claims?: Readonly<Record<string, string>>;
  readonly roster?: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly actorName?: string;
  readonly actorAction?: string;
}): MessageCreateOptions {
  const notifyAt = computeNotifyAt(input.config.warAt, input.config.notifyMinutesBefore);
  const content = [
    '**DESTILED · Wojna królestw**',
    applyMessageTemplate(input.config.messageTemplate, {
      warAt: input.config.warAt,
      minutes: input.config.notifyMinutesBefore,
      notifyMinutesBefore: input.config.notifyMinutesBefore,
      notifyAt,
    }),
  ];

  if (input.actorName && input.actorAction) {
    content.push('', `Aktualizacja zespołu: **${input.actorName}** ${input.actorAction}.`);
  }

  content.push('', '**Aktualny stan wyboru postaci:**');

  const claims = input.claims ?? {};
  const roster = [...(input.roster ?? KINGDOM_WAR_CHARACTER_STUB)].slice(0, 20);
  for (const character of roster) {
    const claimedBy = claims[character.id];
    content.push(
      claimedBy
        ? `• **${character.name}** — zajęta przez <@${claimedBy}>`
        : `• **${character.name}** — wolna`,
    );
  }

  content.push('', '_Kliknij przycisk z nazwą wolnej postaci. Po wyborze cały zespół dostanie zaktualizowany stan._');

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < roster.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const character of roster.slice(i, i + 5)) {
      const claimedBy = claims[character.id];
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(
            createSignedCustomId(
              'war_claim',
              character.id.slice(0, 80),
              input.signingSecret,
            ),
          )
          .setLabel(buttonLabel(character.name))
          .setStyle(claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setDisabled(Boolean(claimedBy)),
      );
    }
    rows.push(row);
  }

  return {
    content: content.join('\n').slice(0, 1900),
    components: rows.slice(0, 5),
  };
}
