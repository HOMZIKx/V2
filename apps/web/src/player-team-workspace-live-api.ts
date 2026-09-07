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
  return parsed;
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
  return { ok: true, snapshot };
}

export function subscribeSharedWorkspaceState(
  workspaceId: string,
  onSnapshot: (snapshot: SharedWorkspaceSnapshot) => void,
): EventSource {
  const source = new EventSource(workspaceUrl(workspaceId, 'events'), { withCredentials: true });
  source.addEventListener('workspace', (event) => {
    if (!(event instanceof MessageEvent)) return;
    try {
      const parsed = parseSnapshot(JSON.parse(String(event.data)));
      if (parsed) onSnapshot(parsed);
    } catch {
      // Keep the SSE connection alive if one malformed event slips through.
    }
  });
  return source;
}
