import type { WorkspaceRecord } from './player-store';

export type SharedWorkspaceSnapshot = {
  readonly workspaceId: string;
  readonly state: Record<string, unknown>;
  readonly revision: number;
  readonly updatedByUserId: string;
  readonly updatedAtIso: string;
};

export type SharedWorkspacePutResult =
  | { readonly ok: true; readonly snapshot: SharedWorkspaceSnapshot }
  | { readonly ok: false; readonly conflict: true; readonly actualRevision: number | null }
  | { readonly ok: false; readonly conflict: false; readonly error: string };

function workspaceUrl(workspaceId: string, suffix: 'state' | 'events'): string {
  return `/player-team/v1/workspaces/${encodeURIComponent(workspaceId)}/${suffix}`;
}

function parseSnapshot(value: unknown): SharedWorkspaceSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.workspaceId !== 'string' ||
    !record.state ||
    typeof record.state !== 'object' ||
    Array.isArray(record.state) ||
    typeof record.revision !== 'number' ||
    !Number.isInteger(record.revision) ||
    record.revision < 0 ||
    typeof record.updatedByUserId !== 'string' ||
    typeof record.updatedAtIso !== 'string'
  ) {
    return null;
  }
  return {
    workspaceId: record.workspaceId,
    state: record.state as Record<string, unknown>,
    revision: record.revision,
    updatedByUserId: record.updatedByUserId,
    updatedAtIso: record.updatedAtIso,
  };
}

function timerRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isLockedDueTimer(timer: Record<string, unknown>): boolean {
  return (
    timer.status === 'running' &&
    timer.progressPercent === 100 &&
    timer.remainingLabel === 'gotowe · zablokowane'
  );
}

/**
 * Timers keep an absolute readyAtIso, but wall-clock expiry must NOT unlock the
 * action. The shared state is reconciled to a locked-due marker; a signed team
 * action (Discord) explicitly starts the next cycle.
 */
function normalizeExpiredTimers(
  state: Record<string, unknown>,
  nowMs = Date.now(),
): { readonly state: Record<string, unknown>; readonly changed: boolean } {
  if (!Array.isArray(state.timers)) return { state, changed: false };
  let changed = false;
  const rawTimers = state.timers as unknown[];
  const timers = rawTimers.map((raw) => {
    const timer = timerRecord(raw);
    if (!timer || timer.status === 'ready' || isLockedDueTimer(timer)) return raw;
    const readyAtIso = typeof timer.readyAtIso === 'string' ? timer.readyAtIso : null;
    if (!readyAtIso) return raw;
    const readyAtMs = Date.parse(readyAtIso);
    if (!Number.isFinite(readyAtMs) || readyAtMs > nowMs) return raw;
    changed = true;
    return {
      ...timer,
      status: 'running',
      progressPercent: 100,
      remainingLabel: 'gotowe · zablokowane',
    };
  });
  return changed ? { state: { ...state, timers }, changed: true } : { state, changed: false };
}

function normalizedSnapshot(snapshot: SharedWorkspaceSnapshot): SharedWorkspaceSnapshot {
  const normalized = normalizeExpiredTimers(snapshot.state);
  return normalized.changed ? { ...snapshot, state: normalized.state } : snapshot;
}

function nextRunningTimerExpiry(state: Record<string, unknown>, nowMs = Date.now()): number | null {
  if (!Array.isArray(state.timers)) return null;
  let earliest: number | null = null;
  for (const raw of state.timers) {
    const timer = timerRecord(raw);
    if (!timer || timer.status === 'ready' || isLockedDueTimer(timer)) continue;
    const readyAtIso = typeof timer.readyAtIso === 'string' ? timer.readyAtIso : null;
    if (!readyAtIso) continue;
    const readyAtMs = Date.parse(readyAtIso);
    if (!Number.isFinite(readyAtMs)) continue;
    const candidate = Math.max(nowMs, readyAtMs);
    if (earliest === null || candidate < earliest) earliest = candidate;
  }
  return earliest;
}

async function reconcileExpiredTimers(workspaceId: string): Promise<void> {
  try {
    const response = await fetch(workspaceUrl(workspaceId, 'state'), {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
    });
    if (!response.ok) return;
    const snapshot = parseSnapshot(await response.json());
    if (!snapshot) return;
    const normalized = normalizeExpiredTimers(snapshot.state);
    if (!normalized.changed) return;

    await fetch(workspaceUrl(workspaceId, 'state'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        state: normalized.state,
        expectedRevision: snapshot.revision,
      }),
    });
  } catch {
    // Best effort while the page is open. A reconnect/reload retries from readyAtIso.
  }
}

export async function getSharedWorkspaceState(workspaceId: string): Promise<SharedWorkspaceSnapshot> {
  const response = await fetch(workspaceUrl(workspaceId, 'state'), {
    method: 'GET',
    cache: 'no-store',
    credentials: 'include',
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`shared workspace GET failed: ${response.status} ${body}`);
  }
  const parsed = parseSnapshot(await response.json());
  if (!parsed) throw new Error('shared workspace GET returned invalid payload');
  return normalizedSnapshot(parsed);
}

export async function putSharedWorkspaceState(input: {
  readonly workspace: WorkspaceRecord;
  readonly expectedRevision: number;
}): Promise<SharedWorkspacePutResult> {
  let response: Response;
  try {
    response = await fetch(workspaceUrl(input.workspace.id, 'state'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        state: input.workspace,
        expectedRevision: input.expectedRevision,
      }),
    });
  } catch (error) {
    return {
      ok: false,
      conflict: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (response.status === 409) {
    let actualRevision: number | null = null;
    try {
      const body = (await response.json()) as {
        readonly error?: { readonly actualRevision?: number | null };
      };
      actualRevision =
        typeof body.error?.actualRevision === 'number' ? body.error.actualRevision : null;
    } catch {
      // ignored
    }
    return { ok: false, conflict: true, actualRevision };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return { ok: false, conflict: false, error: `${response.status} ${body}` };
  }

  const snapshot = parseSnapshot(await response.json());
  if (!snapshot) {
    return { ok: false, conflict: false, error: 'invalid shared workspace PUT response' };
  }
  return { ok: true, snapshot: normalizedSnapshot(snapshot) };
}

export function subscribeSharedWorkspaceState(
  workspaceId: string,
  onSnapshot: (snapshot: SharedWorkspaceSnapshot) => void,
): EventSource {
  const source = new EventSource(workspaceUrl(workspaceId, 'events'), { withCredentials: true });
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleExpiryReconciliation = (snapshot: SharedWorkspaceSnapshot) => {
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
    const now = Date.now();
    const nextExpiry = nextRunningTimerExpiry(snapshot.state, now);
    if (nextExpiry === null) return;
    const delay = Math.max(100, Math.min(2_147_000_000, nextExpiry - now + 150));
    expiryTimer = setTimeout(() => {
      expiryTimer = null;
      void reconcileExpiredTimers(workspaceId);
    }, delay);
  };

  source.addEventListener('workspace', (event) => {
    if (!(event instanceof MessageEvent)) return;
    try {
      const parsed = parseSnapshot(JSON.parse(String(event.data)));
      if (!parsed) return;
      const normalized = normalizedSnapshot(parsed);
      onSnapshot(normalized);
      scheduleExpiryReconciliation(normalized);
      if (normalized.state !== parsed.state) {
        void reconcileExpiredTimers(workspaceId);
      }
    } catch {
      // Keep the SSE connection alive if one malformed event slips through.
    }
  });

  const originalClose = source.close.bind(source);
  source.close = () => {
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = null;
    originalClose();
  };

  return source;
}
