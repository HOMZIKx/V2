import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageCreateOptions,
} from 'discord.js';

import {
  isCharacterProgressTimerPayload,
  isLiveTimerDue,
  type TimerNotifyPayload,
} from '../../application/notify/notify-payload.js';
import { createCharacterTimerButtonCustomId } from '../../infrastructure/security/character-timer-custom-id.js';
import { createTimerButtonCustomId } from '../../infrastructure/security/timer-custom-id.js';

export type TimerNotifyRenderInput = {
  readonly payload: TimerNotifyPayload;
  readonly content: string;
  readonly signingSecret: string;
  readonly includeButtons: boolean;
};

function timerButtonLabel(label: string): string {
  const trimmed = label.trim();
  return trimmed.length <= 70 ? trimmed : `${trimmed.slice(0, 67)}…`;
}

export function renderTimerNotifyMessage(input: TimerNotifyRenderInput): MessageCreateOptions {
  const { payload, content, signingSecret, includeButtons } = input;
  if (!includeButtons || signingSecret.length === 0) {
    return { content };
  }

  if (isCharacterProgressTimerPayload(payload) && payload.timerId) {
    try {
      const live = (payload.liveTimers ?? []).slice(0, 12);
      const focusId = payload.timerId;
      const rows: ActionRowBuilder<ButtonBuilder>[] = [];

      if (live.length > 0) {
        // Buttons use timer names, not anonymous 1..N numbers. A running timer stays
        // locked. Once its wall clock is due, the button becomes the explicit team
        // action that starts the next cycle.
        for (let i = 0; i < live.length; i += 5) {
          const chunk = live.slice(i, i + 5);
          const row = new ActionRowBuilder<ButtonBuilder>();
          chunk.forEach((timer) => {
            const due = isLiveTimerDue(timer);
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(
                  createCharacterTimerButtonCustomId(
                    'gotowe',
                    { timerId: timer.id },
                    signingSecret,
                  ),
                )
                .setLabel(timerButtonLabel(timer.label))
                .setStyle(due ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(!due),
            );
          });
          rows.push(row);
        }
      } else {
        rows.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(
                createCharacterTimerButtonCustomId('gotowe', { timerId: focusId }, signingSecret),
              )
              .setLabel(timerButtonLabel(payload.timerLabel ?? 'Odśwież timer'))
              .setStyle(ButtonStyle.Success),
          ),
        );
      }

      const aux = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(
            createCharacterTimerButtonCustomId('przypomnij', { timerId: focusId }, signingSecret),
          )
          .setLabel('Przypomnij później')
          .setStyle(ButtonStyle.Secondary),
      );
      try {
        aux.addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('Otwórz timery')
            .setURL(payload.deepLinkUrl),
        );
      } catch {
        // invalid deep link
      }
      rows.push(aux);
      return { content, components: rows.slice(0, 5) };
    } catch {
      return { content };
    }
  }

  // Legacy map-hunt payloads only — not exposed in Technika.
  if (!payload.mapKey || payload.channel === undefined || !payload.timerKey) {
    return { content };
  }

  try {
    const buttonPayload = {
      mapKey: payload.mapKey,
      channel: payload.channel,
      timerKey: payload.timerKey,
    };
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(createTimerButtonCustomId('zbite', buttonPayload, signingSecret))
        .setLabel('Gotowe')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(createTimerButtonCustomId('odloz', buttonPayload, signingSecret))
        .setLabel('Przypomnij później')
        .setStyle(ButtonStyle.Secondary),
    );
    return { content, components: [row] };
  } catch {
    return { content };
  }
}
