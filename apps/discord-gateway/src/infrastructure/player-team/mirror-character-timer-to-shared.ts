type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Existing Discord timer actions historically updated /me/state first. This helper
 * mirrors only the affected timer into the authoritative shared workspace, with CAS
 * retries, so the web team view and every DM panel converge on the same state.
 */
export async function mirrorCharacterTimerToSharedWorkspace(input: {
  readonly baseUrl: string;
  readonly demoViewerHeader: string;
  readonly viewerId: string;
  readonly workspaceId: string;
  readonly timerId: string;
  readonly maxAttempts?: number;
}): Promise<boolean> {
  const base = input.baseUrl.replace(/\/$/, '');
  const headers = { [input.demoViewerHeader]: input.viewerId };

  let privateResponse: Response;
  try {
    privateResponse = await fetch(`${base}/player-team/v1/me/state`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });
  } catch {
    return false;
  }
  if (!privateResponse.ok) return false;
  const privateBody = (await privateResponse.json().catch(() => null)) as { readonly state?: unknown } | null;
  const privateState = asRecord(privateBody?.state);
  const privateWorkspaces = Array.isArray(privateState?.workspaces) ? privateState.workspaces : [];
  const privateWorkspace = privateWorkspaces
    .map(asRecord)
    .find((row) => row !== null && asString(row.id) === input.workspaceId);
  if (!privateWorkspace) return false;
  const privateTimer = (Array.isArray(privateWorkspace.timers) ? privateWorkspace.timers : [])
    .map(asRecord)
    .find((row) => row !== null && asString(row.id) === input.timerId);
  if (!privateTimer) return false;

  const attempts = Math.max(1, Math.min(5, input.maxAttempts ?? 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let sharedResponse: Response;
    try {
      sharedResponse = await fetch(
        `${base}/player-team/v1/workspaces/${encodeURIComponent(input.workspaceId)}/state`,
        { method: 'GET', headers, cache: 'no-store' },
      );
    } catch {
      return false;
    }
    if (!sharedResponse.ok) return false;
    const sharedBody = (await sharedResponse.json().catch(() => null)) as {
      readonly state?: unknown;
      readonly revision?: number;
    } | null;
    const shared = asRecord(sharedBody?.state);
    if (!shared) return false;

    const timers = (Array.isArray(shared.timers) ? shared.timers : []).map((raw) => {
      const row = asRecord(raw);
      return row && asString(row.id) === input.timerId ? { ...row, ...privateTimer } : raw;
    });
    if (!timers.some((raw) => asString(asRecord(raw)?.id) === input.timerId)) return false;

    const nextState: LooseRecord = {
      ...shared,
      timers,
      revision: typeof shared.revision === 'number' ? shared.revision + 1 : shared.revision,
    };

    let put: Response;
    try {
      put = await fetch(
        `${base}/player-team/v1/workspaces/${encodeURIComponent(input.workspaceId)}/state`,
        {
          method: 'PUT',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({
            state: nextState,
            expectedRevision:
              typeof sharedBody?.revision === 'number' ? sharedBody.revision : undefined,
          }),
        },
      );
    } catch {
      return false;
    }
    if (put.ok) return true;
    if (put.status !== 409) return false;
  }
  return false;
}
