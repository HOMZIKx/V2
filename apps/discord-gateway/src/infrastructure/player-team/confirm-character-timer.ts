import { ownerViewerIdCandidates } from './owner-viewer-id.js';
import {
  inferProgressionKind,
  restartAfterDone,
  type ProgressionKind,
} from './progression-restart.js';

export type ConfirmCharacterTimerFromBotInput = {
  readonly baseUrl: string;
  readonly demoViewerHeader: string;
  readonly viewerId: string;
  readonly timerId: string;
  readonly actorName: string;
};

export type LiveTimerSnapshot = {
  readonly id: string;
  readonly label: string;
  readonly status: string;
  readonly remainingLabel?: string;
  readonly detail?: string;
  readonly readyAtIso?: string;
};

export type ConfirmCharacterTimerFromBotResult =
  | {
      readonly ok: true;
      readonly revision: number;
      readonly label: string;
      readonly characterName: string | null;
      readonly characterId: string | null;
      /** Which demo-viewer key actually held the timer (for diagnostics). */
      readonly resolvedViewerId: string;
      /** LIVE card timers after the update (for Discord DM refresh). */
      readonly liveTimers: readonly LiveTimerSnapshot[];
    }
  | { readonly ok: false; readonly error: string; readonly status: number };

export type SnoozeCharacterTimerFromBotInput = ConfirmCharacterTimerFromBotInput & {
  readonly reminderMinutesBefore: number;
};

export type SnoozeCharacterTimerFromBotResult =
  | {
      readonly ok: true;
      readonly revision: number;
      readonly label: string;
      readonly characterName: string | null;
      readonly characterId: string | null;
      readonly resolvedViewerId: string;
      readonly reminderMinutesBefore: number;
    }
  | { readonly ok: false; readonly error: string; readonly status: number };

type LooseTimer = {
  id?: string;
  characterId?: string;
  label?: string;
  status?: string;
  kind?: ProgressionKind;
  durationMinutes?: number;
  remainingLabel?: string;
  detail?: string;
  readyAtIso?: string;
  [key: string]: unknown;
};

type LooseWorkspace = {
  id?: string;
  revision?: number;
  timers?: LooseTimer[];
  characters?: Array<{ id?: string; name?: string }>;
  history?: unknown[];
  [key: string]: unknown;
};

type LooseState = {
  workspaces?: LooseWorkspace[];
  [key: string]: unknown;
};

type LoadedState = {
  readonly viewerId: string;
  readonly body: { readonly state?: LooseState | null; readonly revision?: number };
  readonly state: LooseState;
  readonly workspaces: LooseWorkspace[];
  readonly foundWorkspaceIndex: number;
  readonly foundTimer: LooseTimer;
};

async function loadStateWithTimer(
  url: string,
  headerName: string,
  viewerId: string,
  timerId: string,
): Promise<
  | { readonly ok: true; readonly loaded: LoadedState }
  | { readonly ok: false; readonly error: string; readonly status: number; readonly empty: boolean }
> {
  try {
    const getRes = await fetch(url, {
      method: 'GET',
      headers: { [headerName]: viewerId },
      cache: 'no-store',
    });
    if (!getRes.ok) {
      const text = await getRes.text();
      return {
        ok: false,
        error: text.slice(0, 200) || `http_${getRes.status}`,
        status: getRes.status,
        empty: false,
      };
    }

    const body = (await getRes.json()) as {
      state?: LooseState | null;
      revision?: number;
    };
    const state: LooseState =
      body.state && typeof body.state === 'object' ? { ...body.state } : {};
    const workspaces = Array.isArray(state.workspaces) ? [...state.workspaces] : [];

    let foundWorkspaceIndex = -1;
    let foundTimer: LooseTimer | null = null;
    for (let wi = 0; wi < workspaces.length; wi += 1) {
      const ws = workspaces[wi];
      if (!ws || !Array.isArray(ws.timers)) continue;
      const timer = ws.timers.find((t) => t && t.id === timerId);
      if (timer) {
        foundWorkspaceIndex = wi;
        foundTimer = timer;
        break;
      }
    }

    if (foundWorkspaceIndex < 0 || !foundTimer) {
      return {
        ok: false,
        error: 'timer_not_found',
        status: 404,
        empty: body.state == null || workspaces.length === 0,
      };
    }

    return {
      ok: true,
      loaded: {
        viewerId,
        body,
        state,
        workspaces,
        foundWorkspaceIndex,
        foundTimer,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'network_error',
      status: 0,
      empty: false,
    };
  }
}

async function resolveLoadedTimer(
  input: ConfirmCharacterTimerFromBotInput,
): Promise<
  | { readonly ok: true; readonly loaded: LoadedState; readonly url: string }
  | { readonly ok: false; readonly error: string; readonly status: number }
> {
  const base = input.baseUrl.replace(/\/$/, '');
  const url = `${base}/player-team/v1/me/state`;
  const candidates = ownerViewerIdCandidates(input.viewerId);

  let lastMiss: { error: string; status: number } = {
    error: 'timer_not_found',
    status: 404,
  };

  for (const candidate of candidates) {
    const attempt = await loadStateWithTimer(
      url,
      input.demoViewerHeader,
      candidate,
      input.timerId,
    );
    if (attempt.ok) {
      return { ok: true, loaded: attempt.loaded, url };
    }
    lastMiss = { error: attempt.error, status: attempt.status };
    if (attempt.status === 401 || attempt.status === 403 || attempt.status === 0) {
      return { ok: false, error: attempt.error, status: attempt.status };
    }
  }

  return { ok: false, error: lastMiss.error, status: lastMiss.status };
}

function snapshotLiveTimers(
  timers: readonly LooseTimer[],
  characterId: string | null | undefined,
): LiveTimerSnapshot[] {
  if (!characterId) return [];
  const out: LiveTimerSnapshot[] = [];
  for (const timer of timers) {
    if (!timer || timer.characterId !== characterId || typeof timer.id !== 'string') continue;
    const label = typeof timer.label === 'string' ? timer.label : timer.id;
    const status = typeof timer.status === 'string' ? timer.status : 'unknown';
    const remainingLabel =
      typeof timer.remainingLabel === 'string' ? timer.remainingLabel : undefined;
    const detail = typeof timer.detail === 'string' ? timer.detail : undefined;
    const readyAtIso = typeof timer.readyAtIso === 'string' ? timer.readyAtIso : undefined;
    out.push({
      id: timer.id,
      label,
      status,
      ...(remainingLabel ? { remainingLabel } : {}),
      ...(detail ? { detail } : {}),
      ...(readyAtIso ? { readyAtIso } : {}),
    });
    if (out.length >= 12) break;
  }
  return out;
}

function timerCanRefresh(timer: LooseTimer): boolean {
  if (!timer.status || timer.status === 'ready') return true;
  if (timer.status !== 'running' || typeof timer.readyAtIso !== 'string') return false;
  const readyAtMs = Date.parse(timer.readyAtIso);
  return Number.isFinite(readyAtMs) && readyAtMs <= Date.now() + 1_000;
}

/**
 * Refreshes a character ProgressTimer from Discord without opening WWW.
 * Running timers stay locked in state after wall-clock completion; the signed DM
 * action is the explicit acknowledgement that starts the next cycle.
 */
export async function confirmCharacterProgressTimerFromBot(
  input: ConfirmCharacterTimerFromBotInput,
): Promise<ConfirmCharacterTimerFromBotResult> {
  const resolved = await resolveLoadedTimer(input);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, status: resolved.status };
  }

  try {
    const { foundTimer, foundWorkspaceIndex, workspaces, state, body, viewerId } = resolved.loaded;
    if (!timerCanRefresh(foundTimer)) {
      return { ok: false, error: 'timer_not_ready', status: 409 };
    }

    const ws = { ...workspaces[foundWorkspaceIndex]! };
    const characterName =
      (ws.characters ?? []).find((c) => c.id === foundTimer.characterId)?.name ?? null;
    const label = typeof foundTimer.label === 'string' ? foundTimer.label : input.timerId;
    const kind =
      (typeof foundTimer.kind === 'string' ? foundTimer.kind : null) ??
      inferProgressionKind(label);
    const durationMinutes =
      typeof foundTimer.durationMinutes === 'number' ? foundTimer.durationMinutes : undefined;
    const restart = restartAfterDone(kind, new Date(), durationMinutes);
    const operationId = `discord-gotowe:${input.timerId}:${Date.now()}`;

    const nextTimers = (ws.timers ?? []).map((timer) => {
      if (!timer || timer.id !== input.timerId) return timer;
      return {
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
      };
    });

    const nextRevision = (typeof ws.revision === 'number' ? ws.revision : 0) + 1;
    workspaces[foundWorkspaceIndex] = {
      ...ws,
      revision: nextRevision,
      timers: nextTimers,
      history: [
        {
          id: `hist-discord-${Date.now().toString(36)}`,
          teamId: ws.id ?? 'unknown',
          actorId: viewerId,
          actorName: input.actorName,
          actorInitials: input.actorName.slice(0, 1).toUpperCase(),
          characterId: foundTimer.characterId ?? null,
          characterName,
          resource: 'timer',
          title: `Odświeżono timer: ${label}`,
          detail: `${restart.detailHint} Odświeżono z Discord PW (bez WWW).`,
          occurredAtLabel: 'teraz',
          revision: nextRevision,
        },
        ...(Array.isArray(ws.history) ? ws.history : []),
      ],
    };

    const putRes = await fetch(resolved.url, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        [input.demoViewerHeader]: viewerId,
      },
      body: JSON.stringify({
        state: { ...state, workspaces },
        expectedRevision: typeof body.revision === 'number' ? body.revision : undefined,
      }),
    });

    if (!putRes.ok) {
      const text = await putRes.text();
      return {
        ok: false,
        error: text.slice(0, 200) || `http_${putRes.status}`,
        status: putRes.status,
      };
    }

    const putJson = (await putRes.json()) as { revision?: number };
    const characterId =
      typeof foundTimer.characterId === 'string' ? foundTimer.characterId : null;
    return {
      ok: true,
      revision: typeof putJson.revision === 'number' ? putJson.revision : nextRevision,
      label,
      characterName,
      characterId,
      resolvedViewerId: viewerId,
      liveTimers: snapshotLiveTimers(nextTimers.filter(Boolean) as LooseTimer[], characterId),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'network_error',
      status: 0,
    };
  }
}

/**
 * "Przypomnij później" — records reminder state without starting a new cycle.
 */
export async function snoozeCharacterProgressTimerFromBot(
  input: SnoozeCharacterTimerFromBotInput,
): Promise<SnoozeCharacterTimerFromBotResult> {
  const minutes = Math.max(1, Math.min(1440, Math.round(input.reminderMinutesBefore || 60)));
  const resolved = await resolveLoadedTimer(input);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, status: resolved.status };
  }

  try {
    const { foundTimer, foundWorkspaceIndex, workspaces, state, body, viewerId } = resolved.loaded;
    const ws = { ...workspaces[foundWorkspaceIndex]! };
    const characterName =
      (ws.characters ?? []).find((c) => c.id === foundTimer.characterId)?.name ?? null;
    const label = typeof foundTimer.label === 'string' ? foundTimer.label : input.timerId;
    const operationId = `discord-later:${input.timerId}:${Date.now()}`;

    const nextTimers = (ws.timers ?? []).map((timer) => {
      if (!timer || timer.id !== input.timerId) return timer;
      return {
        ...timer,
        discordReminder: true,
        reminderState: 'on',
        lastActorName: input.actorName,
        lastConfirmedAt: 'teraz',
        operationId,
      };
    });

    const nextRevision = (typeof ws.revision === 'number' ? ws.revision : 0) + 1;
    workspaces[foundWorkspaceIndex] = {
      ...ws,
      revision: nextRevision,
      timers: nextTimers,
      history: [
        {
          id: `hist-discord-later-${Date.now().toString(36)}`,
          teamId: ws.id ?? 'unknown',
          actorId: viewerId,
          actorName: input.actorName,
          actorInitials: input.actorName.slice(0, 1).toUpperCase(),
          characterId: foundTimer.characterId ?? null,
          characterName,
          resource: 'timer',
          title: `Przypomnij później: ${label}`,
          detail: `Discord PW — przypomnienie za ok. ${minutes} min (bez WWW).`,
          occurredAtLabel: 'teraz',
          revision: nextRevision,
        },
        ...(Array.isArray(ws.history) ? ws.history : []),
      ],
    };

    const putRes = await fetch(resolved.url, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        [input.demoViewerHeader]: viewerId,
      },
      body: JSON.stringify({
        state: { ...state, workspaces },
        expectedRevision: typeof body.revision === 'number' ? body.revision : undefined,
      }),
    });

    if (!putRes.ok) {
      const text = await putRes.text();
      return {
        ok: false,
        error: text.slice(0, 200) || `http_${putRes.status}`,
        status: putRes.status,
      };
    }

    const putJson = (await putRes.json()) as { revision?: number };
    return {
      ok: true,
      revision: typeof putJson.revision === 'number' ? putJson.revision : nextRevision,
      label,
      characterName,
      characterId: typeof foundTimer.characterId === 'string' ? foundTimer.characterId : null,
      resolvedViewerId: viewerId,
      reminderMinutesBefore: minutes,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'network_error',
      status: 0,
    };
  }
}
