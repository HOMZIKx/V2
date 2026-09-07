type WorkspaceSnapshot = {
  readonly state: Record<string, unknown>;
  readonly revision: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, '');
}

async function loadWorkspace(input: {
  readonly baseUrl: string;
  readonly demoViewerHeader: string;
  readonly viewerId: string;
  readonly workspaceId: string;
}): Promise<WorkspaceSnapshot | null> {
  const response = await fetch(
    `${normalizeBaseUrl(input.baseUrl)}/player-team/v1/workspaces/${encodeURIComponent(input.workspaceId)}/state`,
    {
      method: 'GET',
      headers: { [input.demoViewerHeader]: input.viewerId },
      cache: 'no-store',
    },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as {
    readonly state?: unknown;
    readonly revision?: unknown;
  };
  const state = asRecord(body.state);
  if (!state || typeof body.revision !== 'number' || !Number.isInteger(body.revision)) return null;
  return { state, revision: body.revision };
}

function readyState(
  state: Record<string, unknown>,
  timerId: string,
): { readonly changed: boolean; readonly state: Record<string, unknown> } {
  if (!Array.isArray(state.timers)) return { changed: false, state };
  let changed = false;
  const timers = state.timers.map((raw) => {
    const timer = asRecord(raw);
    if (!timer || timer.id !== timerId || timer.status === 'ready') return raw;
    const readyAtIso = typeof timer.readyAtIso === 'string' ? timer.readyAtIso : null;
    if (readyAtIso) {
      const readyAtMs = Date.parse(readyAtIso);
      // A stale/early worker must never finish a newly restarted cycle.
      if (Number.isFinite(readyAtMs) && readyAtMs > Date.now() + 1_000) return raw;
    }
    changed = true;
    return {
      ...timer,
      status: 'ready',
      progressPercent: 100,
      remainingLabel: 'gotowe',
    };
  });
  return changed ? { changed: true, state: { ...state, timers } } : { changed: false, state };
}

/**
 * Persist wall-clock completion into the shared workspace. Revision conflicts are
 * retried once so an unrelated live EQ edit cannot leave the timer permanently running.
 */
export async function markCharacterTimerReadyInWorkspace(input: {
  readonly baseUrl: string;
  readonly demoViewerHeader: string;
  readonly viewerId: string;
  readonly workspaceId: string;
  readonly timerId: string;
}): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await loadWorkspace(input);
    if (!current) return false;
    const normalized = readyState(current.state, input.timerId);
    if (!normalized.changed) return true;

    const response = await fetch(
      `${normalizeBaseUrl(input.baseUrl)}/player-team/v1/workspaces/${encodeURIComponent(input.workspaceId)}/state`,
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          [input.demoViewerHeader]: input.viewerId,
        },
        body: JSON.stringify({
          state: normalized.state,
          expectedRevision: current.revision,
        }),
      },
    );
    if (response.ok) return true;
    if (response.status !== 409) return false;
  }
  return false;
}
