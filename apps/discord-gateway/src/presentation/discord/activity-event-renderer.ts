import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type MessageCreateOptions,
  type MessageEditOptions,
} from 'discord.js';

import {
  createEventCustomId,
  type ActivityEventAction,
} from '../../infrastructure/security/activity-signed-custom-id.js';

export const ACTIVITY_EVENT_ACCENT = 0x0d9488;

export type EventStatusDefView = {
  opaqueId: string;
  label: string;
  occupiesSlot: boolean;
};

export type ActivityEventRenderInput = {
  opaqueEventId: string;
  signingSecret: string;
  name: string;
  typeLabel: string;
  statusLabel: string;
  startAtIso: string;
  endAtIso?: string | null;
  locationText?: string | null;
  organizerLabel: string;
  coOrganizerLabel?: string | null;
  description?: string | null;
  occupiedSlots: number;
  participantLimit: number | null;
  statusSummaries: Array<{ label: string; count: number }>;
  participantPreview?: string[];
  statusDefs: EventStatusDefView[];
  rsvpDisabled?: boolean;
  secondaryDisabled?: boolean;
};

export type ActivityEventMessagePayload = MessageCreateOptions & MessageEditOptions;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function renderActivityEventMessage(
  input: ActivityEventRenderInput,
): ActivityEventMessagePayload {
  const seats =
    input.participantLimit === null
      ? `Miejsca: ${input.occupiedSlots} / ∞`
      : `Miejsca: ${input.occupiedSlots} / ${input.participantLimit}`;

  const schedule = [
    input.startAtIso,
    input.endAtIso ? `→ ${input.endAtIso}` : null,
    input.locationText ? `· ${input.locationText}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const orgLine = [
    `Organizator: ${input.organizerLabel}`,
    input.coOrganizerLabel ? `Współorganizator: ${input.coOrganizerLabel}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const aggregates =
    input.statusSummaries.length === 0
      ? 'Brak zapisów'
      : input.statusSummaries.map((s) => `${s.label}: ${s.count}`).join(' · ');

  const preview =
    input.participantPreview !== undefined && input.participantPreview.length > 0
      ? `Uczestnicy: ${input.participantPreview.slice(0, 8).join(', ')}${
          input.participantPreview.length > 8 ? '…' : ''
        }`
      : null;

  const container = new ContainerBuilder().setAccentColor(ACTIVITY_EVENT_ACCENT);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `## ${input.name}`,
        `${input.typeLabel} · **${input.statusLabel}**`,
        schedule,
        orgLine,
        input.description ? input.description.slice(0, 500) : null,
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent([seats, aggregates, preview].filter(Boolean).join('\n')),
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  );

  const rsvpButtons = input.statusDefs.slice(0, 10).map((status) =>
    new ButtonBuilder()
      .setCustomId(
        createEventCustomId(input.opaqueEventId, 'rsvp', input.signingSecret, status.opaqueId),
      )
      .setLabel(status.label.slice(0, 80))
      .setStyle(status.occupiesSlot ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(input.rsvpDisabled === true),
  );

  for (const row of chunk(rsvpButtons, 5)) {
    container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(...row));
  }

  const secondaryActions: Array<{
    label: string;
    action: ActivityEventAction;
    style: ButtonStyle;
  }> = [
    { label: 'Lista uczestników', action: 'participants', style: ButtonStyle.Secondary },
    { label: 'Kontakt', action: 'contact', style: ButtonStyle.Secondary },
    { label: 'Więcej', action: 'more', style: ButtonStyle.Primary },
  ];

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...secondaryActions.map((item) =>
        new ButtonBuilder()
          .setCustomId(createEventCustomId(input.opaqueEventId, item.action, input.signingSecret))
          .setLabel(item.label)
          .setStyle(item.style)
          .setDisabled(input.secondaryDisabled === true && item.action !== 'participants'),
      ),
    ),
  );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}
