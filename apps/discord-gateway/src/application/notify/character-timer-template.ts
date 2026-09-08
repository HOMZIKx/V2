import type { CharacterTimersConfig } from '../technika/capabilities.js';
import {
  applyNotifyTemplate,
  formatLiveTimerStatus,
  type TimerNotifyPayload,
} from './notify-payload.js';

function otherTimersSummary(payload: TimerNotifyPayload): string {
  if (payload.roomSummary && payload.roomSummary.length > 0) {
    return payload.roomSummary.slice(0, 8).join('\n');
  }

  return (payload.liveTimers ?? [])
    .filter((timer) => timer.id !== payload.timerId)
    .slice(0, 8)
    .map((timer) => `${timer.label} — ${formatLiveTimerStatus(timer)}`)
    .join('\n');
}

/**
 * Render the live character-timer DM from the currently active Technika config.
 * Map/metin notifications deliberately stay on their legacy formatter.
 */
export function formatCharacterTimerTemplateContent(
  payload: TimerNotifyPayload,
  config: CharacterTimersConfig,
): string {
  const content = applyNotifyTemplate(config.messageTemplate, {
    title: payload.title,
    body: payload.body,
    characterName: payload.characterName,
    timerLabel: payload.timerLabel ?? payload.timerId,
    endsAt: payload.endsAt,
    otherTimersSummary: otherTimersSummary(payload),
    deepLinkUrl: payload.deepLinkUrl,
    minutes: config.reminderMinutesBefore,
    reminderMinutesBefore: config.reminderMinutesBefore,
  });

  return content.trim().slice(0, 1900);
}
