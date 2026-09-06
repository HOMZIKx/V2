import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageCreateOptions,
} from 'discord.js';

import {
  isCharacterProgressTimerPayload,
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

export function renderTimerNotifyMessage(input: TimerNotifyRenderInput): MessageCreateOptions {
  const { payload, content, signingSecret, includeButtons } = input;
  if (!includeButtons || signingSecret.length === 0) {
    return { content };
  }

  if (isCharacterProgressTimerPayload(payload) && payload.timerId) {
    try {
      const buttonPayload = { timerId: payload.timerId };
      const gotowe = new ButtonBuilder()
        .setCustomId(createCharacterTimerButtonCustomId('gotowe', buttonPayload, signingSecret))
        .setLabel('Gotowe')
        .setStyle(ButtonStyle.Success);

      const later = new ButtonBuilder()
        .setCustomId(createCharacterTimerButtonCustomId('przypomnij', buttonPayload, signingSecret))
        .setLabel('Przypomnij później')
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(gotowe, later);
      try {
        row.addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('Otwórz kartę')
            .setURL(payload.deepLinkUrl),
        );
      } catch {
        // invalid deep link
      }
      return { content, components: [row] };
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
