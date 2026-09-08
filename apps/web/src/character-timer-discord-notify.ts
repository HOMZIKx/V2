/**
 * Character timer → Discord daily panel bridge.
 * There are no standalone character-timer DMs anymore. A timer mutation only refreshes
 * the team's one daily PW panel and schedules visual threshold refreshes in the gateway.
 */

import type { DiscordTimerNotifyResult } from './discord-notify-api';
import type { PlayerIdentity, ProgressTimer, WorkspaceRecord } from './player-store';
import { inferProgressionKind, restartAfterDone } from './project-hard-progression';
import { refreshTeamDailyTimerPanel } from './team-daily-timer-panel-api';

export type CharacterTimerNotifyContext = {
  readonly workspace: WorkspaceRecord;
  readonly timer: ProgressTimer;
  readonly viewer: PlayerIdentity | null;
  readonly actorName: string;
  readonly kind: 'reset' | 'reminder' | 'manual';
  readonly extraRecipientDiscordIds?: readonly string[];
};

function timerForPanelRefresh(ctx: CharacterTimerNotifyContext): ProgressTimer {
  if (ctx.kind !== 'reset') return ctx.timer;
  const kind = ctx.timer.kind ?? inferProgressionKind(ctx.timer.label);
  const restart = restartAfterDone(kind, new Date(), ctx.timer.durationMinutes);
  return {
    ...ctx.timer,
    ...(kind ? { kind } : {}),
    status: 'running',
    readyAtIso: restart.readyAtIso,
    remainingLabel: restart.remainingLabel,
    progressPercent: 4,
  };
}

export function buildCharacterTimerNotifyCopy(input: {
  readonly characterName: string;
  readonly timer: ProgressTimer;
  readonly actorName: string;
  readonly kind: 'reset' | 'reminder' | 'manual';
}): { title: string; body: string } {
  const { characterName, timer, actorName, kind } = input;
  if (kind === 'reset') {
    return {
      title: `${timer.label} · ${characterName}`,
      body: `${actorName} odświeżył timer. Dzienny panel PW został zaktualizowany.`,
    };
  }
  if (kind === 'reminder') {
    return {
      title: `${timer.label} · ${characterName}`,
      body: 'Stan timera został zaktualizowany w dziennym panelu PW.',
    };
  }
  return {
    title: `${timer.label} · ${characterName}`,
    body: 'Dzienny panel PW został zsynchronizowany.',
  };
}

export async function notifyCharacterProgressTimer(
  ctx: CharacterTimerNotifyContext,
): Promise<{ readonly sent: number; readonly results: readonly DiscordTimerNotifyResult[] }> {
  const timer = timerForPanelRefresh(ctx);

  // Shared workspace writes are intentionally debounced in PlayerStoreProvider (120 ms).
  // Waiting briefly here prevents the gateway from re-reading the previous server revision
  // and repainting the PW panel with stale timer data immediately after a WWW click.
  await new Promise<void>((resolve) => window.setTimeout(resolve, 350));

  const ok = await refreshTeamDailyTimerPanel(ctx.workspace.id, {
    timerId: timer.id,
    ...(timer.readyAtIso ? { endsAt: timer.readyAtIso } : {}),
  });
  return { sent: ok ? 1 : 0, results: [] };
}

/**
 * Browser timers stay disabled. The gateway owns the persistent threshold/ready refresh queue.
 */
export function scheduleCharacterTimerReminder(_input: {
  readonly endsAtIso: string | null;
  readonly reminderMinutesBefore: number;
  readonly fire: () => void;
}): (() => void) | null {
  void _input;
  return null;
}
