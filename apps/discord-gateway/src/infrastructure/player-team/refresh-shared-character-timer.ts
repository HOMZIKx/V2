import {
  inferProgressionKind,
  restartAfterDone,
  type ProgressionKind,
} from './progression-restart.js';

export type SharedLiveTimerSnapshot = {
  readonly id: string;
  readonly label: string;
  readonly status: string;
  readonly remainingLabel?: string;
  readonly detail?: string;
  readonly readyAtIso?: string;
};

export type RefreshSharedCharacterTimerResult =
  | {
      readonly ok: true;
      readonly revision: number;
      readonly workspaceId: string;
      readonly characterId: string | null;
      readonly characterName: string | null;
      readonly label: string;
      readonly readyAtIso: string;
      readonly liveTimers: readonly SharedLiveTimerSnapshot[];
    }
  | { readonly ok: false; readonly error: string; readonly status: number };

type LooseRecord = Record<string, unknown>;

type SharedSnapshot = {
  readonly state: LooseRecord;
  readonly revision: number;
};

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

function workspaceUrl(baseUrl: string, workspaceId: string): string {
  return `${baseUrl.replace(/\/$/, '')}/player-team/v1/workspaces/${encodeURIComponent(workspaceId)}/state`;
}

async function readShared(input: {
  readonly baseUrl: string;
  readonly demoViewerHeader: string;
  readonly viewerId: string;
  readonly workspaceId: string;
}): Promise<SharedSnapshot | null> {
  const response = await fetch(workspaceUrl(input.baseUrl, input.workspaceId), {
    method: 'GET',
    headers: { [input.demoViewerHeader]: input.viewerId },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { readonly state?: unknown; readonly revision?: unknown };
  const state = asRecord(body.state);
  if (!state || typeof body.revision !== 'number' || !Number.isInteger(body.revision)) return null;
  return { state, revision: body.revision };
}

function timerCanRefresh(timer: LooseRecord, nowMs = Date.now()): boolean {
  if (!timer.status || timer.status === 'ready') return true;
  if (timer.status !== 'running' || typeof timer.readyAtIso !== 'string') return false;
  const readyAtMs = Date.parse(timer.readyAtIso);
  return Number.isFinite(readyAtMs) && readyAtMs <= nowMs + 1_000;
}

function liveTimersForCharacter(
  timers: readonly LooseRecord[],
  characterId: string | null,
): SharedLiveTimerSnapshot[] {
  if (!characterId) return [];
  return timers
    .filter((timer) => timer.characterId === characterId && typeof timer.id === 'string')
    .slice(0, 12)
    .map((timer) => {
      const id = timer.id as string;
      const label = typeof timer.label === 'string' ? timer.label : id;
      const status = typeof timer.status === 'string' ? timer.status : 'unknown';
      const remainingLabel =
        typeof timer.remainingLabel === 'string' ? timer.remainingLabel : undefined;
      const detail = typeof timer.detail === 'string' ? timer.detail : undefined;
      const readyAtIso = typeof timer.readyAtIso === 'string' ? timer.readyAtIso : undefined;
      return {
        id,
        label,
        status,
        ...(remainingLabel ? { remainingLabel } : {}),
        ...(detail ? { detail } : {}),
        ...(readyAtIso ? { readyAtIso } : {}),
      };
    });
}

/**
 * Refresh a due character timer in the SHARED workspace. This is the authoritative
 * team write used by Discord; every web client receives it through workspace SSE.
 */
export async function refreshSharedCharacterTimer(input: {
  readonly baseUrl: string;
  readonly demoViewerHeader: string;
  readonly viewerId: string;
  readonly workspaceId: string;
  readonly timerId: string;
  readonly actorName: string;
}): Promise<RefreshSharedCharacterTimerResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let current: SharedSnapshot | null;
    try {
      current = await readShared(input);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'network_error',
        status: 0,
      };
    }
    if (!current) return { ok: false, error: 'workspace_not_found', status: 404 };

    const rawTimers = Array.isArray(current.state.timers) ? current.state.timers : [];
    const timers = rawTimers.map(asRecord).filter((row): row is LooseRecord => row !== null);
    const focus = timers.find((timer) => timer.id === input.timerId);
    if (!focus) return { ok: false, error: 'timer_not_found', status: 404 };
    if (!timerCanRefresh(focus)) return { ok: false, error: 'timer_not_ready', status: 409 };

    const characterId = typeof focus.characterId === 'string' ? focus.characterId : null;
    const characters = Array.isArray(current.state.characters)
      ? current.state.characters.map(asRecord).filter((row): row is LooseRecord => row !== null)
      : [];
    const characterName = characterId
      ? ((characters.find((row) => row.id === characterId)?.name as string | undefined) ?? null)
      : null;
    const label = typeof focus.label === 'string' ? focus.label : input.timerId;
    const kind =
      (typeof focus.kind === 'string' ? (focus.kind as ProgressionKind) : null) ??
      inferProgressionKind(label);
    const durationMinutes =
      typeof focus.durationMinutes === 'number' ? focus.durationMinutes : undefined;
    const restart = restartAfterDone(kind, new Date(), durationMinutes);
    const operationId = `discord-team-refresh:${input.timerId}:${Date.now()}`;

    const nextTimers = timers.map((timer) =>
      timer.id === input.timerId
        ? {
            ...timer,
            ...(kind ? { kind } : {}),
            status: 'running',
            progressPercent: 4,
            remainingLabel: restart.remainingLabel,
            readyAtIso: restart.readyAtIso,
            lastActorName: input.actorName,
            lastConfirmedAt: 'teraz',
            operationId,
            discordReminder: true,
            reminderState: 'on',
          }
        : timer,
    );

    const workspaceRevision =
      typeof current.state.revision === 'number' ? current.state.revision + 1 : 1;
    const oldHistory = Array.isArray(current.state.history) ? current.state.history : [];
    const nextState: LooseRecord = {
      ...current.state,
      revision: workspaceRevision,
      updatedLabel: 'teraz',
      timers: nextTimers,
      history: [
        {
          id: `hist-discord-team-${Date.now().toString(36)}`,
          teamId: input.workspaceId,
          actorId: input.viewerId,
          actorName: input.actorName,
          actorInitials: input.actorName.slice(0, 1).toUpperCase(),
          characterId,
          characterName,
          resource: 'timer',
          title: `Odświeżono timer: ${label}`,
          detail: `${restart.detailHint} Odświeżono przez Discord; zmiana rozesłana zespołowi.`,
          occurredAtLabel: 'teraz',
          revision: workspaceRevision,
        },
        ...oldHistory,
      ],
    };

    let response: Response;
    try {
      response = await fetch(workspaceUrl(input.baseUrl, input.workspaceId), {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          [input.demoViewerHeader]: input.viewerId,
        },
        body: JSON.stringify({ state: nextState, expectedRevision: current.revision }),
      });
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'network_error',
        status: 0,
      };
    }

    if (response.status === 409) continue;
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        ok: false,
        error: text.slice(0, 200) || `http_${response.status}`,
        status: response.status,
      };
    }

    const body = (await response.json()) as { readonly revision?: unknown };
    return {
      ok: true,
      revision: typeof body.revision === 'number' ? body.revision : current.revision + 1,
      workspaceId: input.workspaceId,
      characterId,
      characterName,
      label,
      readyAtIso: restart.readyAtIso,
      liveTimers: liveTimersForCharacter(nextTimers, characterId),
    };
  }

  return { ok: false, error: 'workspace_revision_conflict', status: 409 };
}
