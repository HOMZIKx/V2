import { ownerViewerIdCandidates } from './owner-viewer-id.js';

export type CharacterTimerCardSnapshot = {
  readonly workspaceId: string | null;
  readonly characterId: string | null;
  readonly characterName: string | null;
  readonly timerId: string;
  readonly timerLabel: string;
  readonly liveTimers: readonly {
    readonly id: string;
    readonly label: string;
    readonly status: string;
    readonly remainingLabel?: string;
    readonly detail?: string;
    readonly readyAtIso?: string;
  }[];
};

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

function cardFromWorkspace(
  workspace: LooseRecord,
  timerId: string,
): CharacterTimerCardSnapshot | null {
  if (!Array.isArray(workspace.timers)) return null;
  const timers = workspace.timers.map(asRecord).filter((row): row is LooseRecord => row !== null);
  const focus = timers.find((timer) => timer.id === timerId);
  if (!focus) return null;

  const characterId = typeof focus.characterId === 'string' ? focus.characterId : null;
  const characters = Array.isArray(workspace.characters)
    ? workspace.characters.map(asRecord).filter((row): row is LooseRecord => row !== null)
    : [];
  const characterName = characterId
    ? ((characters.find((row) => row.id === characterId)?.name as string | undefined) ?? null)
    : null;

  const liveTimers = timers
    .filter((timer) => !characterId || timer.characterId === characterId)
    .slice(0, 12)
    .flatMap((timer) => {
      if (typeof timer.id !== 'string') return [];
      const label = typeof timer.label === 'string' ? timer.label : timer.id;
      const status = typeof timer.status === 'string' ? timer.status : 'unknown';
      const remainingLabel =
        typeof timer.remainingLabel === 'string' ? timer.remainingLabel : undefined;
      const detail = typeof timer.detail === 'string' ? timer.detail : undefined;
      const readyAtIso = typeof timer.readyAtIso === 'string' ? timer.readyAtIso : undefined;
      return [
        {
          id: timer.id,
          label,
          status,
          ...(remainingLabel ? { remainingLabel } : {}),
          ...(detail ? { detail } : {}),
          ...(readyAtIso ? { readyAtIso } : {}),
        },
      ];
    });

  return {
    workspaceId: typeof workspace.id === 'string' ? workspace.id : null,
    characterId,
    characterName,
    timerId,
    timerLabel: typeof focus.label === 'string' ? focus.label : timerId,
    liveTimers,
  };
}

export async function readSharedCharacterTimerCardFromBot(input: {
  readonly baseUrl: string;
  readonly demoViewerHeader: string;
  readonly viewerId: string;
  readonly workspaceId: string;
  readonly timerId: string;
}): Promise<CharacterTimerCardSnapshot | null> {
  let response: Response;
  try {
    response = await fetch(
      `${input.baseUrl.replace(/\/$/, '')}/player-team/v1/workspaces/${encodeURIComponent(input.workspaceId)}/state`,
      {
        method: 'GET',
        headers: { [input.demoViewerHeader]: input.viewerId },
        cache: 'no-store',
      },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body = (await response.json()) as { readonly state?: unknown };
  const workspace = asRecord(body.state);
  if (!workspace) return null;
  return cardFromWorkspace(workspace, input.timerId);
}

/**
 * Locate a timer through the viewer snapshot, then immediately prefer the SHARED
 * workspace card. The personal snapshot is only a locator/fallback; shared state is SoT.
 */
export async function readCharacterTimerCardFromBot(input: {
  readonly baseUrl: string;
  readonly demoViewerHeader: string;
  readonly viewerId: string;
  readonly timerId: string;
}): Promise<CharacterTimerCardSnapshot | null> {
  const url = `${input.baseUrl.replace(/\/$/, '')}/player-team/v1/me/state`;

  for (const viewerId of ownerViewerIdCandidates(input.viewerId)) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { [input.demoViewerHeader]: viewerId },
        cache: 'no-store',
      });
    } catch {
      return null;
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return null;
      continue;
    }

    const body = (await response.json()) as { readonly state?: unknown };
    const state = asRecord(body.state);
    if (!state || !Array.isArray(state.workspaces)) continue;

    for (const rawWorkspace of state.workspaces) {
      const workspace = asRecord(rawWorkspace);
      if (!workspace) continue;
      const located = cardFromWorkspace(workspace, input.timerId);
      if (!located) continue;

      if (located.workspaceId) {
        const shared = await readSharedCharacterTimerCardFromBot({
          baseUrl: input.baseUrl,
          demoViewerHeader: input.demoViewerHeader,
          viewerId,
          workspaceId: located.workspaceId,
          timerId: input.timerId,
        });
        if (shared) return shared;
      }
      return located;
    }
  }

  return null;
}
