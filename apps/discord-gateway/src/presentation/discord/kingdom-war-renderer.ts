import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  type MessageCreateOptions,
} from 'discord.js';

import { applyMessageTemplate, computeNotifyAt } from '../../application/config/live-bot-config.js';
import type { KingdomWarConfig } from '../../application/technika/capabilities.js';
import { createSignedCustomId } from '../../infrastructure/security/signed-custom-id.js';

/** Stub roster until Kuzyn profile is the SoT — not a fake roster API. */
export const KINGDOM_WAR_CHARACTER_STUB = [
  { id: 'stub-1', name: 'Postać A (stub)' },
  { id: 'stub-2', name: 'Postać B (stub)' },
  { id: 'stub-3', name: 'Postać C (stub)' },
] as const;

export function renderKingdomWarReminder(input: {
  readonly config: KingdomWarConfig;
  readonly signingSecret: string;
  readonly claims?: Readonly<Record<string, string>>;
  readonly roster?: ReadonlyArray<{ readonly id: string; readonly name: string }>;
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
    '',
    'Wybierz postać, którą bierzesz na wojnę (stub — SoT: Kuzyn):',
  ];

  const claims = input.claims ?? {};
  const roster = [...(input.roster ?? KINGDOM_WAR_CHARACTER_STUB)];
  for (const character of roster) {
    const claimedBy = claims[character.id];
    content.push(
      claimedBy
        ? `• ${character.name} — zajęta (<@${claimedBy}>)`
        : `• ${character.name} — wolna`,
    );
  }

  const free = roster.filter((c) => !claims[c.id]);
  const select = new StringSelectMenuBuilder()
    .setCustomId(createSignedCustomId('war_claim', 'kw1', input.signingSecret))
    .setPlaceholder(free.length ? 'Wybierz postać na wojnę' : 'Brak wolnych postaci')
    .setDisabled(free.length === 0)
    .addOptions(
      (free.length ? free : roster.slice(0, 1)).map((c) => ({
        label: c.name.slice(0, 100),
        value: c.id.slice(0, 100),
        description: claims[c.id] ? 'Zajęta' : 'Wolna',
      })),
    );

  return {
    content: content.join('\n').slice(0, 1900),
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  };
}
