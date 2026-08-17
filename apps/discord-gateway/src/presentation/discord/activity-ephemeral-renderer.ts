import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type InteractionReplyOptions,
  type Message,
} from 'discord.js';

import {
  createDraftCustomId,
  createEventCustomId,
  type ActivityDraftAction,
} from '../../infrastructure/security/activity-signed-custom-id.js';
import {
  collectComponentStrings,
  signDraftFormUiState,
  type DraftFormUiState,
} from './activity-draft-ui-state.js';
import { ACTIVITY_MODULE_ACCENT } from './activity-theme.js';

export type DraftFormSummaryInput = {
  opaqueDraftId: string;
  signingSecret: string;
  title?: string;
  lines: string[];
  formState?: DraftFormUiState;
};

/** Single ephemeral preview: Edit / Publish / Cancel — no sectional wizard. */
export function renderDraftFormSummary(input: DraftFormSummaryInput): InteractionReplyOptions {
  const mainActions: Array<{ label: string; action: ActivityDraftAction; style: ButtonStyle }> = [
    { label: 'Edytuj', action: 'edit', style: ButtonStyle.Secondary },
    { label: 'Publikuj', action: 'publish', style: ButtonStyle.Success },
    { label: 'Anuluj', action: 'discard', style: ButtonStyle.Danger },
  ];

  const container = new ContainerBuilder().setAccentColor(ACTIVITY_MODULE_ACCENT);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [`## ${input.title ?? 'Podgląd aktywności'}`, ...input.lines].join('\n'),
    ),
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  );
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...mainActions.map((item) =>
        new ButtonBuilder()
          .setCustomId(createDraftCustomId(input.opaqueDraftId, item.action, input.signingSecret))
          .setLabel(item.label)
          .setStyle(item.style),
      ),
    ),
  );

  if (input.formState !== undefined) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `\u2063${signDraftFormUiState(input.formState, input.signingSecret)}\u2063`,
      ),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

export function isDraftPreviewMessage(message: Message | null | undefined): boolean {
  if (message === null || message === undefined) {
    return false;
  }
  return collectComponentStrings(message.components).some((value) => value.includes(':draft:'));
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
    flags: MessageFlags.IsComponentsV2,
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
    flags: MessageFlags.IsComponentsV2,
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
    flags: MessageFlags.IsComponentsV2,
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
    flags: MessageFlags.IsComponentsV2,
  };
}
