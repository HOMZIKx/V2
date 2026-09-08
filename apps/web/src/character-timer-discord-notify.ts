/**
 * Discord notify for character ProgressTimers (EQ/Timer tab).
 * Team coordination is deliberate here: timer changes are broadcast to every
 * current team member that has a resolvable Discord account. This never expands
 * to a Discord guild roster.
 */

import {
  buildCharacterTimerRoomSummary,
  buildCharacterTimersDeepLinkUrl,
  postDiscordTimerNotify,
  postDiscordTimerResetNotify,
  syncKingdomWarRecipients,
  type DiscordLiveTimerSnapshot,
  type DiscordTimerNotifyResult,
} from './discord-notify-api';
import {
  resolveMemberDiscordAccountId,
  type ProgressTimer,
  type WorkspaceRecord,
  type PlayerIdentity,
} from './player-store';
import { inferProgressionKind, restartAfterDone } from './project-hard-progression';

export type CharacterTimerNotifyContext = {
  readonly workspace: WorkspaceRecord;
  readonly timer: ProgressTimer;
  readonly viewer: PlayerIdentity | null;
  readonly actorName: string;
  readonly kind: 'reset' | 'reminder' | 'manual';
  /** Optional extra Discord snowflakes — still intersected with team membership. */
  readonly extraRecipientDiscordIds?: readonly string[];
};

function recipientIds(ctx: CharacterTimerNotifyContext): string[] {
  const allowed = new Set<string>();
  for (const member of ctx.workspace.members) {
    const discordId = resolveMemberDiscordAccountId(member, ctx.viewer);
    if (discordId) allowed.add(discordId);
  }
  if (allowed.size === 0) return [];

  const extras = ctx.extraRecipientDiscordIds;
  if (extras && extras.length > 0) {
    const out: string[] = [];
    for (const raw of extras) {
      const id = raw.trim();
      if (allowed.has(id)) out.push(id);
    }
    return [...new Set(out)];
  }
  return [...allowed];
}

/**
 * React store updates are asynchronous. The caller can still hold the old readyAtIso
 * immediately after pressing Start. Recompute the just-started cycle here so Discord
 * and the gateway scheduler always receive the NEW end time, never the previous one.
 */
function timerForNotify(ctx: CharacterTimerNotifyContext): ProgressTimer {
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

function liveTimerSnapshots(
  workspace: WorkspaceRecord,
  focusTimer: ProgressTimer,
): DiscordLiveTimerSnapshot[] {
  const timers = workspace.timers
    .filter((timer) => timer.characterId === focusTimer.characterId)
    .map((timer) => (timer.id === focusTimer.id ? focusTimer : timer));

  return timers.slice(0, 12).map((timer) => ({
    id: timer.id,
    label: timer.label,
    status: timer.status,
    ...(timer.remainingLabel ? { remainingLabel: timer.remainingLabel } : {}),
    ...(timer.detail ? { detail: timer.detail } : {}),
    ...(timer.readyAtIso ? { readyAtIso: timer.readyAtIso } : {}),
  }));
}

export function buildCharacterTimerNotifyCopy(input: {
  readonly characterName: string;
  readonly timer: ProgressTimer;
  readonly actorName: string;
  readonly kind: 'reset' | 'reminder' | 'manual';
}): { title: string; body: string } {
  const { characterName, timer, actorName, kind } = input;
  if (kind === 'reminder') {
    return {
      title: `${timer.label} · ${characterName}`,
      body: 'Timer jest gotowy. Stan całej karty znajduje się poniżej.',
    };
  }
  if (kind === 'reset') {
    return {
      title: `${timer.label} · ${characterName}`,
      body: `${actorName} odświeżył timer. Cały zespół widzi poniżej aktualny stan timerów tej postaci.`,
    };
  }
  return {
    title: `${timer.label} · ${characterName}`,
    body: `Aktualizacja timera ${timer.label} na ${characterName}.`,
  };
}

/**
 * Broadcast a character timer card to team DMs.
 * Every message contains the full timer state for the affected character.
 */
export async function notifyCharacterProgressTimer(
  ctx: CharacterTimerNotifyContext,
): Promise<{ readonly sent: number; readonly results: readonly DiscordTimerNotifyResult[] }> {
  const recipients = recipientIds(ctx);
  if (recipients.length === 0) {
    return { sent: 0, results: [] };
  }

  // Register the explicit current workspace roster as the bot's team-coordination
  // audience as well. This keeps later Discord-originated timer/war actions on the
  // same team boundary instead of falling back to guild membership.
  void syncKingdomWarRecipients(recipients);

  const timer = timerForNotify(ctx);
  const characterName =
    ctx.workspace.characters.find((c) => c.id === timer.characterId)?.name ?? timer.characterId;
  const { title, body } = buildCharacterTimerNotifyCopy({
    characterName,
    timer,
    actorName: ctx.actorName,
    kind: ctx.kind,
  });
  const deepLinkUrl = buildCharacterTimersDeepLinkUrl(ctx.workspace.id, timer.characterId);
  const roomSummary = buildCharacterTimerRoomSummary(
    ctx.workspace.timers,
    ctx.workspace.characters,
    timer.id,
  );
  const liveTimers = liveTimerSnapshots(ctx.workspace, timer);

  const results: DiscordTimerNotifyResult[] = [];
  let sent = 0;

  const actorDiscord =
    ctx.viewer?.discordAccountId?.trim() &&
    /^\d{17,20}$/.test(ctx.viewer.discordAccountId.trim())
      ? ctx.viewer.discordAccountId.trim()
      : null;

  // Reset event: one team broadcast to everyone except actor, plus actor confirmation.
  if (ctx.kind === 'reset') {
    const others = recipients.filter((id) => id !== actorDiscord);
    if (others.length > 0 && actorDiscord) {
      const reset = await postDiscordTimerResetNotify({
        actorDiscordUserId: actorDiscord,
        actorName: ctx.actorName,
        title,
        body,
        deepLinkUrl,
        workspaceId: ctx.workspace.id,
        characterId: timer.characterId,
        characterName,
        timerId: timer.id,
        timerLabel: timer.label,
        ...(timer.readyAtIso ? { endsAt: timer.readyAtIso } : {}),
        roomSummary,
        liveTimers,
        recipientDiscordUserIds: others,
        idempotencyKey: `char-timer-reset:${timer.id}:${timer.operationId ?? Date.now()}`,
      });
      if (reset.ok) sent += reset.sent ?? 0;
    }
  }

  const directRecipients =
    ctx.kind === 'reset'
      ? recipients.filter((id) => id === actorDiscord)
      : recipients;

  for (const discordUserId of directRecipients) {
    const result = await postDiscordTimerNotify({
      discordUserId,
      title,
      body,
      deepLinkUrl,
      workspaceId: ctx.workspace.id,
      characterId: timer.characterId,
      characterName,
      timerId: timer.id,
      timerLabel: timer.label,
      ...(timer.readyAtIso ? { endsAt: timer.readyAtIso } : {}),
      roomSummary,
      liveTimers,
      includeButtons: true,
      kind: ctx.kind,
      actorName: ctx.actorName,
      idempotencyKey: `char-timer:${ctx.kind}:${timer.id}:${discordUserId}:${timer.operationId ?? Math.floor(Date.now() / 30_000)}`,
    });
    results.push(result);
    if (result.ok && !result.duplicate && result.skipped !== 'dms_closed') {
      sent += 1;
    }
  }

  return { sent, results };
}

/**
 * Browser timers are intentionally disabled. Durable reminders belong to the
 * discord-gateway queue so closing the tab or refreshing the web app cannot lose them.
 */
export function scheduleCharacterTimerReminder(_input: {
  readonly endsAtIso: string | null;
  readonly reminderMinutesBefore: number;
  readonly fire: () => void;
}): (() => void) | null {
  return null;
}
