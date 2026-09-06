import { ownerViewerIdCandidates } from './owner-viewer-id.js';

export type ConfirmCharacterTimerFromBotInput = {
  readonly baseUrl: string;
  readonly demoViewerHeader: string;
  readonly viewerId: string;
  readonly timerId: string;
  readonly actorName: string;
};

export type ConfirmCharacterTimerFromBotResult =
  | {
      readonly ok: true;
      readonly revision: number;
      readonly label: string;
      readonly characterName: string | null;
      /** Which demo-viewer key actually held the timer (for diagnostics). */
      readonly resolvedViewerId: string;
    }
  | { readonly ok: false; readonly error: string; readonly status: number };

type LooseTimer = {
  id?: string;
  characterId?: string;
  label?: string;
  status?: string;
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

/**
 * Marks a character ProgressTimer done in player-team /me/state
 * so Discord "Gotowe" works without opening WWW.
 *
 * Tries bare Discord snowflake first, then `discord:<id>` alias, so WWW
 * (snowflake viewer.id) and legacy bot keys resolve to the same snapshot.
 */
export async function confirmCharacterProgressTimerFromBot(
  input: ConfirmCharacterTimerFromBotInput,
): Promise<ConfirmCharacterTimerFromBotResult> {
  const base = input.baseUrl.replace(/\/$/, '');
  const url = `${base}/player-team/v1/me/state`;
  const candidates = ownerViewerIdCandidates(input.viewerId);

  let lastMiss: { error: string; status: number } = {
    error: 'timer_not_found',
    status: 404,
  };
  let loaded: LoadedState | null = null;

  for (const candidate of candidates) {
    const attempt = await loadStateWithTimer(
      url,
      input.demoViewerHeader,
      candidate,
      input.timerId,
    );
    if (attempt.ok) {
      loaded = attempt.loaded;
      break;
    }
    lastMiss = { error: attempt.error, status: attempt.status };
    // Keep trying aliases on empty/missing timer; stop on hard auth/network errors.
    if (attempt.status === 401 || attempt.status === 403 || attempt.status === 0) {
      return { ok: false, error: attempt.error, status: attempt.status };
    }
  }

  if (!loaded) {
    return { ok: false, error: lastMiss.error, status: lastMiss.status };
  }

  try {
    const { foundTimer, foundWorkspaceIndex, workspaces, state, body, viewerId } = loaded;
    const ws = { ...workspaces[foundWorkspaceIndex]! };
    const characterName =
      (ws.characters ?? []).find((c) => c.id === foundTimer.characterId)?.name ?? null;
    const label = typeof foundTimer.label === 'string' ? foundTimer.label : input.timerId;
    const operationId = `discord-gotowe:${input.timerId}:${Date.now()}`;
    const readyAtIso = new Date(Date.now() + 60 * 60_000).toISOString();

    const nextTimers = (ws.timers ?? []).map((timer) => {
      if (!timer || timer.id !== input.timerId) return timer;
      return {
        ...timer,
        status: 'running',
        progressPercent: 4,
        remainingLabel: 'odliczanie rozpoczęte',
        readyAtIso,
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
          id: `hist-discord-${Date.now().toString(36)}`,
          teamId: ws.id ?? 'unknown',
          actorId: viewerId,
          actorName: input.actorName,
          actorInitials: input.actorName.slice(0, 1).toUpperCase(),
          characterId: foundTimer.characterId ?? null,
          characterName,
          resource: 'timer',
          title: `Oznaczono wykonane: ${label}`,
          detail: 'Gotowe z Discord PW (bez WWW).',
          occurredAtLabel: 'teraz',
          revision: nextRevision,
        },
        ...(Array.isArray(ws.history) ? ws.history : []),
      ],
    };

    const putRes = await fetch(url, {
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
      resolvedViewerId: viewerId,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'network_error',
      status: 0,
    };
  }
}
