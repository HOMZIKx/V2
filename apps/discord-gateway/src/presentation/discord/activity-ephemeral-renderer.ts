import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  TextDisplayBuilder,
  type InteractionReplyOptions,
} from 'discord.js';

import {
  createDraftCustomId,
  createEventCustomId,
  type ActivityDraftAction,
} from '../../infrastructure/security/activity-signed-custom-id.js';

export type DraftFormSummaryInput = {
  opaqueDraftId: string;
  signingSecret: string;
  title?: string;
  lines: string[];
};

export function renderDraftFormSummary(input: DraftFormSummaryInput): InteractionReplyOptions {
  const editActions: Array<{ label: string; action: ActivityDraftAction; style: ButtonStyle }> = [
    { label: 'Nazwa i opis', action: 'section_basics', style: ButtonStyle.Secondary },
    { label: 'Data i godzina', action: 'section_schedule', style: ButtonStyle.Secondary },
  ];
  const mainActions: Array<{ label: string; action: ActivityDraftAction; style: ButtonStyle }> = [
    { label: 'Podgląd', action: 'preview', style: ButtonStyle.Secondary },
    { label: 'Publikuj', action: 'publish', style: ButtonStyle.Success },
    { label: 'Odrzuć', action: 'discard', style: ButtonStyle.Danger },
  ];

  return {
    components: [
      new TextDisplayBuilder().setContent(
        [`## ${input.title ?? 'Szkic aktywności'}`, ...input.lines].join('\n'),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...editActions.map((item) =>
          new ButtonBuilder()
            .setCustomId(createDraftCustomId(input.opaqueDraftId, item.action, input.signingSecret))
            .setLabel(item.label)
            .setStyle(item.style),
        ),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...mainActions.map((item) =>
          new ButtonBuilder()
            .setCustomId(createDraftCustomId(input.opaqueDraftId, item.action, input.signingSecret))
            .setLabel(item.label)
            .setStyle(item.style),
        ),
      ),
    ],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  };
}

export type MoreMenuInput = {
  opaqueEventId: string;
  signingSecret: string;
  activityName: string;
  role: 'participant' | 'organizer' | 'moderator';
};

export function renderMoreMenu(input: MoreMenuInput): InteractionReplyOptions {
  const lines = [`## Więcej — ${input.activityName}`, `Rola: **${input.role}**`];
  const buttons: ButtonBuilder[] = [];

  if (input.role === 'participant') {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(createEventCustomId(input.opaqueEventId, 'resign', input.signingSecret))
        .setLabel('Zrezygnuj')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(createEventCustomId(input.opaqueEventId, 'report', input.signingSecret))
        .setLabel('Zgłoś')
        .setStyle(ButtonStyle.Danger),
    );
  }

  if (input.role === 'organizer' || input.role === 'moderator') {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(createEventCustomId(input.opaqueEventId, 'edit', input.signingSecret))
        .setLabel('Edytuj')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(createEventCustomId(input.opaqueEventId, 'regs_close', input.signingSecret))
        .setLabel('Zamknij zapisy')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(createEventCustomId(input.opaqueEventId, 'cancel', input.signingSecret))
        .setLabel('Anuluj')
        .setStyle(ButtonStyle.Danger),
    );
  }

  if (input.role === 'moderator') {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(createEventCustomId(input.opaqueEventId, 'takeover', input.signingSecret))
        .setLabel('Przejmij')
        .setStyle(ButtonStyle.Danger),
    );
  }

  return {
    components: [
      new TextDisplayBuilder().setContent(lines.join('\n')),
      new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(0, 5)),
    ],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  };
}

export type ParticipantsListInput = {
  activityName: string;
  lines: string[];
};

export function renderParticipantsList(input: ParticipantsListInput): InteractionReplyOptions {
  const body =
    input.lines.length === 0 ? '_Brak uczestników._' : input.lines.slice(0, 40).join('\n');
  return {
    components: [
      new TextDisplayBuilder().setContent(`## Lista uczestników — ${input.activityName}\n${body}`),
    ],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  };
}

export type InboxListInput = {
  lines: string[];
};

export function renderInboxList(input: InboxListInput): InteractionReplyOptions {
  const body =
    input.lines.length === 0 ? '_Brak powiadomień._' : input.lines.slice(0, 30).join('\n');
  return {
    components: [new TextDisplayBuilder().setContent(`## Powiadomienia\n${body}`)],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  };
}

export type PreviewInput = {
  title: string;
  lines: string[];
};

export function renderActivityPreview(input: PreviewInput): InteractionReplyOptions {
  return {
    components: [
      new TextDisplayBuilder().setContent(
        [`## Podgląd — ${input.title}`, ...input.lines].join('\n'),
      ),
    ],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  };
}
