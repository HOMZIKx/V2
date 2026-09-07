import { ActionRowBuilder, StringSelectMenuBuilder, type MessageCreateOptions } from 'discord.js';

import { applyMessageTemplate, computeNotifyAt } from '../../application/config/live-bot-config.js';
import type { KingdomWarConfig } from '../../application/technika/capabilities.js';
import { createSignedCustomId } from '../../infrastructure/security/signed-custom-id.js';

/** Stub roster until Kuzyn profile is the SoT — not a fake roster API. */
/** Clear tonight labels — stub until Kuzyn roster SoT. Claims still durable (max 3 / user). */
export const KINGDOM_WAR_CHARACTER_STUB = [
  { id: 'stub-1', name: 'Postać 1 · deklaracja na wojnę' },
  { id: 'stub-2', name: 'Postać 2 · deklaracja na wojnę' },
  { id: 'stub-3', name: 'Postać 3 · deklaracja na wojnę' },
  { id: 'stub-4', name: 'Postać 4 · deklaracja na wojnę' },
  { id: 'stub-5', name: 'Postać 5 · deklaracja na wojnę' },
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
    'Wybierz postać na wojnę (lista tymczasowa na dziś — claimy trzymane do końca dnia PL):',
  ];

  const claims = input.claims ?? {};
  const roster = [...(input.roster ?? KINGDOM_WAR_CHARACTER_STUB)];
  for (const character of roster) {
    const claimedBy = claims[character.id];
    content.push(
      claimedBy ? `• ${character.name} — zajęta (<@${claimedBy}>)` : `• ${character.name} — wolna`,
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
