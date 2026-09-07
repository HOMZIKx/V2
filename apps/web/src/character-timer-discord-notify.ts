/**
 * Additive Discord notify for character ProgressTimers (EQ/Timer tab).
 * Does not touch EQ inventory UI — call from Start / complete paths only.
 *
 * HARD RULE: DM fan-out is ONLY team members with notifyPrefs.characterTimers
 * true (default true if missing). Never expands to a Discord guild roster.
 */

import {
  buildCharacterTimerRoomSummary,
  buildCharacterTimersDeepLinkUrl,
  postDiscordTimerNotify,
  postDiscordTimerResetNotify,
  type DiscordTimerNotifyResult,
} from './discord-notify-api';
import {
  listTeamNotifyDiscordRecipients,
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
  /**
   * Optional extra Discord snowflakes — HARD-intersected with team notifyPrefs
   * allowlist (never used to bypass prefs or reach non-members).
   */
  readonly extraRecipientDiscordIds?: readonly string[];
};

function recipientIds(ctx: CharacterTimerNotifyContext): string[] {
  const allowed = new Set(
    listTeamNotifyDiscordRecipients(ctx.workspace, 'characterTimers', ctx.viewer),
  );
  if (allowed.size === 0) return [];

  const extras = ctx.extraRecipientDiscordIds;
  if (extras && extras.length > 0) {
    const out: string[] = [];
    for (const raw of extras) {
      const id = raw.trim();
      if (allowed.has(id)) out.push(id);
    }
    return out;
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
      body: `Timer postaci kończy się wkrótce (${timer.remainingLabel || 'wkrótce'}). Oznacz Gotowe w Discord albo na karcie postaci.`,
    };
  }
  if (kind === 'reset') {
    return {
      title: `${timer.label} · ${characterName}`,
      body: `${actorName} uruchomił timer postaci. Koniec: ${timer.readyAtIso ?? timer.remainingLabel ?? 'w toku'}.`,
    };
  }
  return {
    title: `${timer.label} · ${characterName}`,
    body: `Ping: timer postaci ${timer.label} na ${characterName}.`,
  };
}

/**
 * Fire-and-forget Discord DMs for a character progress timer.
 * Returns results per recipient (for tests / optional UI notice).
 */
export async function notifyCharacterProgressTimer(
  ctx: CharacterTimerNotifyContext,
): Promise<{ readonly sent: number; readonly results: readonly DiscordTimerNotifyResult[] }> {
  const recipients = recipientIds(ctx);
  if (recipients.length === 0) {
    return { sent: 0, results: [] };
  }

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

  const results: DiscordTimerNotifyResult[] = [];
  let sent = 0;

  const actorDiscord =
    ctx.viewer?.discordAccountId?.trim() &&
    /^\d{17,20}$/.test(ctx.viewer.discordAccountId.trim())
      ? ctx.viewer.discordAccountId.trim()
      : null;

  // Fan-out to other team recipients (prefs-filtered). Actor skipped here.
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
        recipientDiscordUserIds: others,
        idempotencyKey: `char-timer-reset:${timer.id}:${timer.operationId ?? Date.now()}`,
      });
      if (reset.ok) sent += reset.sent ?? 0;
    }
  }

  // Direct DMs: for reset, actor only (others already via reset fan-out);
  // for reminder/manual, all prefs-allowed team recipients.
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

/** Schedule browser reminder ~reminderMinutesBefore endsAt (best-effort local). */
export function scheduleCharacterTimerReminder(input: {
  readonly endsAtIso: string | null;
  readonly reminderMinutesBefore: number;
  readonly fire: () => void;
}): (() => void) | null {
  if (!input.endsAtIso || typeof window === 'undefined') return null;
  const ends = Date.parse(input.endsAtIso);
  if (!Number.isFinite(ends)) return null;
  const fireAt = ends - input.reminderMinutesBefore * 60_000;
  const delay = fireAt - Date.now();
  if (delay < 5_000 || delay > 48 * 3_600_000) return null;
  const handle = window.setTimeout(() => input.fire(), delay);
  return () => window.clearTimeout(handle);
}
