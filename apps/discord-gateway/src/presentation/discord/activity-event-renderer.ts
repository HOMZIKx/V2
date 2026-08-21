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

import { ACTIVITY_EVENT_ACCENT } from './activity-theme.js';
import { formatPolishLocalDateTime } from './localized-datetime.js';

export { ACTIVITY_EVENT_ACCENT } from './activity-theme.js';

function formatEventWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return formatPolishLocalDateTime(date);
}

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
  /** Natural Polish schedule line; preferred over raw start/end ISO. */
  scheduleLabel?: string | null;
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
  visibility?: 'public' | 'private';
  seriesOccurrenceIndex?: number | null;
};

export type ActivityEventMessagePayload = MessageCreateOptions & MessageEditOptions;

export function formatEventCapacity(
  occupiedSlots: number,
  participantLimit: number | null,
): string {
  if (participantLimit === null) {
    return `Miejsca: bez limitu · zapisanych: ${occupiedSlots}`;
  }
  return `Miejsca: ${occupiedSlots}/${participantLimit}`;
}

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
  const seats = formatEventCapacity(input.occupiedSlots, input.participantLimit);

  const scheduleCore =
    typeof input.scheduleLabel === 'string' && input.scheduleLabel.trim().length > 0
      ? input.scheduleLabel.trim()
      : [
          formatEventWhen(input.startAtIso),
          input.endAtIso ? `→ ${formatEventWhen(input.endAtIso)}` : null,
        ]
          .filter(Boolean)
          .join(' ');
  const schedule = [scheduleCore, input.locationText ? `· ${input.locationText}` : null]
    .filter(Boolean)
    .join(' ');

  const orgLine = [
    `Prowadzi: ${input.organizerLabel}`,
    input.coOrganizerLabel ? `razem z ${input.coOrganizerLabel}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const aggregates =
    input.statusSummaries.length === 0
      ? null
      : input.statusSummaries.map((s) => `${s.label}: ${s.count}`).join(' · ');

  const preview =
    input.participantPreview !== undefined && input.participantPreview.length > 0
      ? input.participantPreview.slice(0, 8).join(', ') +
        (input.participantPreview.length > 8 ? '…' : '')
      : null;

  const visibilityTag = input.visibility === 'private' ? 'prywatna' : null;
  const seriesTag =
    input.seriesOccurrenceIndex !== undefined && input.seriesOccurrenceIndex !== null
      ? `seria #${input.seriesOccurrenceIndex + 1}`
      : null;
  const metaBits = [input.typeLabel, seats, input.statusLabel, visibilityTag, seriesTag].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );

  const container = new ContainerBuilder().setAccentColor(ACTIVITY_EVENT_ACCENT);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [`## ${input.name}`, `**${schedule}**`, metaBits.join(' · ')].join('\n'),
    ),
  );

  const bodyLines = [
    input.description ? input.description.slice(0, 500) : null,
    orgLine.length > 0 ? orgLine : null,
    aggregates,
    preview,
  ].filter((line): line is string => line !== null && line.length > 0);

  if (bodyLines.length > 0) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines.join('\n')));
  }

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
    { label: 'Więcej', action: 'more', style: ButtonStyle.Secondary },
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
