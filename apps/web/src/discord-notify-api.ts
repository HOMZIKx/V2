/**
 * Browser client for character ProgressTimers → Discord notify.
 * Calls same-origin `/api/discord-notify` (server holds DISCORD_NOTIFY_SHARED_SECRET).
 * Product: EQ/Timer tab timers (Księga, Kamień…) — not map/metin.
 */

export interface DiscordLiveTimerSnapshot {
  readonly id: string;
  readonly label: string;
  readonly status: string;
  readonly remainingLabel?: string;
  readonly detail?: string;
  readonly readyAtIso?: string;
}

export interface DiscordTimerNotifyInput {
  readonly discordUserId: string;
  readonly title: string;
  readonly body: string;
  readonly deepLinkUrl: string;
  readonly workspaceId?: string;
  readonly characterId?: string;
  readonly characterName?: string;
  readonly timerId?: string;
  readonly timerLabel?: string;
  readonly endsAt?: string;
  /** @deprecated map-hunt legacy */
  readonly mapKey?: string;
  readonly channel?: number;
  readonly timerKey?: string;
  readonly idempotencyKey?: string;
  readonly discordChannelId?: string;
  readonly roomSummary?: readonly string[];
  readonly liveTimers?: readonly DiscordLiveTimerSnapshot[];
  readonly includeButtons?: boolean;
  readonly kind?: 'manual' | 'reset' | 'reminder';
  readonly actorName?: string;
}

export type DiscordTimerNotifyResult =
  | {
      readonly ok: true;
      readonly delivery: 'dm' | 'channel';
      readonly duplicate: boolean;
      readonly messageId: string | null;
      readonly skipped?: 'dms_closed';
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly status: number;
      readonly detail?: string;
    };

async function postNotify(
  path: string,
  body: unknown,
): Promise<Record<string, unknown> & { status: number; okHttp: boolean }> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const raw = await res.text();
  let parsed: Record<string, unknown> = {};
  if (raw.trim()) {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {
        okHttp: false,
        status: res.status,
        error: 'invalid_gateway_response',
        detail: raw.slice(0, 200),
      };
    }
  }
  return { ...parsed, status: res.status, okHttp: res.ok };
}

export async function postDiscordTimerNotify(
  input: DiscordTimerNotifyInput,
): Promise<DiscordTimerNotifyResult> {
  try {
    const parsed = await postNotify('/api/discord-notify', { ...input, action: 'timer' });

    if (!parsed.okHttp) {
      const err =
        typeof parsed.error === 'string'
          ? parsed.error
          : typeof parsed.message === 'string'
            ? String(parsed.message)
            : `http_${parsed.status}`;
      return {
        ok: false,
        error: err,
        status: parsed.status,
        ...(typeof parsed.detail === 'string' ? { detail: parsed.detail } : {}),
      };
    }

    if (parsed.ok === true) {
      return {
        ok: true,
        delivery: parsed.delivery === 'channel' ? 'channel' : 'dm',
        duplicate: Boolean(parsed.duplicate),
        messageId: typeof parsed.messageId === 'string' ? parsed.messageId : null,
        ...(parsed.skipped === 'dms_closed' ? { skipped: 'dms_closed' as const } : {}),
      };
    }

    return {
      ok: false,
      error: typeof parsed.error === 'string' ? parsed.error : 'notify_failed',
      status: parsed.status,
    };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export async function postDiscordTimerResetNotify(input: {
  readonly actorDiscordUserId: string;
  readonly actorName?: string;
  readonly title: string;
  readonly body: string;
  readonly deepLinkUrl: string;
  readonly workspaceId?: string;
  readonly characterId?: string;
  readonly characterName?: string;
  readonly timerId?: string;
  readonly timerLabel?: string;
  readonly endsAt?: string;
  readonly mapKey?: string;
  readonly channel?: number;
  readonly timerKey?: string;
  readonly roomSummary?: readonly string[];
  readonly liveTimers?: readonly DiscordLiveTimerSnapshot[];
  readonly recipientDiscordUserIds?: readonly string[];
  readonly idempotencyKey?: string;
}): Promise<{ readonly ok: boolean; readonly sent?: number; readonly error?: string }> {
  try {
    const parsed = await postNotify('/api/discord-notify', { ...input, action: 'reset' });
    if (!parsed.okHttp || parsed.ok !== true) {
      return {
        ok: false,
        error: typeof parsed.error === 'string' ? parsed.error : 'reset_notify_failed',
      };
    }
    return {
      ok: true,
      sent: typeof parsed.sent === 'number' ? parsed.sent : 0,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'network_error',
    };
  }
}

export function buildCharacterTimersDeepLinkUrl(
  teamId: string,
  characterId: string,
): string {
  const path = `/teams/${encodeURIComponent(teamId)}/characters/${encodeURIComponent(characterId)}?view=timers`;
  if (typeof window === 'undefined') {
    return `http://127.0.0.1:3000${path}`;
  }
  return `${window.location.origin}${path}`;
}

/** @deprecated use buildCharacterTimersDeepLinkUrl — map Timers deep link kept for legacy. */
export function buildTimersDeepLinkUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:3000/timers';
  }
  return `${window.location.origin}/timers`;
}

export function buildCharacterTimerRoomSummary(
  timers: readonly {
    readonly id: string;
    readonly characterId: string;
    readonly label: string;
    readonly status: string;
    readonly remainingLabel: string;
  }[],
  characters: readonly { readonly id: string; readonly name: string }[],
  exceptTimerId: string,
): string[] {
  const nameById = new Map(characters.map((c) => [c.id, c.name]));
  const lines: string[] = [];
  for (const timer of timers) {
    if (timer.id === exceptTimerId) continue;
    const who = nameById.get(timer.characterId) ?? timer.characterId;
    const state =
      timer.status === 'ready'
        ? 'gotowe'
        : timer.status === 'running'
          ? timer.remainingLabel || 'w toku'
          : timer.status;
    lines.push(`${who} · ${timer.label} — ${state}`);
    if (lines.length >= 8) break;
  }
  return lines;
}

export async function registerDiscordTimerWatcher(input: {
  readonly discordUserId: string;
  readonly mapKey: string;
  readonly channel: number;
}): Promise<{ readonly ok: boolean }> {
  try {
    const parsed = await postNotify('/api/discord-notify', { ...input, action: 'watch' });
    return { ok: Boolean(parsed.okHttp && parsed.ok === true) };
  } catch {
    return { ok: false };
  }
}

function normalizeRecipientSnowflakes(recipients: readonly string[]): string[] {
  return [
    ...new Set(
      recipients
        .map((id) => id.trim())
        .filter((id) => /^\d{17,20}$/.test(id)),
    ),
  ].slice(0, 40);
}

/** Register explicit player-team members as the bot's coordination audience. */
export async function syncTeamCoordinationRecipients(
  recipients: readonly string[],
): Promise<{ readonly ok: boolean; readonly count?: number; readonly error?: string }> {
  try {
    const snowflakes = normalizeRecipientSnowflakes(recipients);
    const parsed = await postNotify('/api/discord-notify', {
      action: 'team-recipients',
      recipients: snowflakes,
    });
    if (!parsed.okHttp || parsed.ok !== true) {
      return {
        ok: false,
        error: typeof parsed.error === 'string' ? parsed.error : 'team_recipients_sync_failed',
      };
    }
    return {
      ok: true,
      count: typeof parsed.count === 'number' ? parsed.count : snowflakes.length,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'network_error',
    };
  }
}

/**
 * Replace the kingdom-war recipient snapshot for ONE workspace/team.
 *
 * The legacy one-argument form is intentionally a no-op: it used to merge every
 * workspace visible to one browser into a global bot audience. Keeping it callable
 * avoids breaking an older provider during rollout while preventing global fan-out.
 */
export async function syncKingdomWarRecipients(
  workspaceIdOrLegacyRecipients: string | readonly string[],
  recipientsMaybe?: readonly string[],
): Promise<{ readonly ok: boolean; readonly count?: number; readonly error?: string }> {
  if (Array.isArray(workspaceIdOrLegacyRecipients)) {
    return { ok: true, count: 0 };
  }

  const workspaceId = workspaceIdOrLegacyRecipients.trim();
  if (!workspaceId || !Array.isArray(recipientsMaybe)) {
    return { ok: false, error: 'invalid_workspace_recipient_scope' };
  }

  try {
    const snowflakes = normalizeRecipientSnowflakes(recipientsMaybe);
    const parsed = await postNotify('/api/discord-notify', {
      action: 'team-war-recipients',
      workspaceId,
      recipients: snowflakes,
    });
    if (!parsed.okHttp || parsed.ok !== true) {
      return {
        ok: false,
        error: typeof parsed.error === 'string' ? parsed.error : 'team_war_recipients_sync_failed',
      };
    }
    return {
      ok: true,
      count: typeof parsed.count === 'number' ? parsed.count : snowflakes.length,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'network_error',
    };
  }
}
