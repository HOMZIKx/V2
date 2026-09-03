export type PlayerTeamOnlineStateResponse = {
  readonly state: Record<string, unknown> | null;
  readonly revision: number | null;
  readonly updatedAtIso?: string | null;
};

export type PlayerTeamPutResult =
  | { readonly ok: true; readonly revision: number | null }
  | { readonly ok: false; readonly conflict: true; readonly actualRevision: number | null }
  | { readonly ok: false; readonly conflict: false; readonly error: string };

const baseUrl =
  (process.env.NEXT_PUBLIC_PLAYER_TEAM_BASE_URL ?? '').trim() || 'http://127.0.0.1:4400';

const demoHeaderName = (
  (process.env.NEXT_PUBLIC_PLAYER_TEAM_DEMO_VIEWER_HEADER ?? '').trim() || 'x-demo-viewer-id'
).toLowerCase();

export async function getMyPlayerTeamState(input: {
  readonly viewerId: string;
}): Promise<PlayerTeamOnlineStateResponse> {
  const res = await fetch(`${baseUrl}/player-team/v1/me/state`, {
    method: 'GET',
    headers: {
      [demoHeaderName]: input.viewerId,
    },
    cache: 'no-store',
  });

  if (res.status === 404) {
    return { state: null, revision: null, updatedAtIso: null };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`player-team getMyState failed: ${res.status} ${body}`);
  }

  const body = (await res.json()) as {
    readonly state: Record<string, unknown> | null;
    readonly revision?: number;
    readonly updatedAtIso?: string;
  };

  return {
    state: body.state ?? null,
    revision: typeof body.revision === 'number' ? body.revision : null,
    updatedAtIso: body.updatedAtIso ?? null,
  };
}

export async function putMyPlayerTeamState(input: {
  readonly viewerId: string;
  readonly state: Record<string, unknown>;
  readonly expectedRevision: number | null;
}): Promise<PlayerTeamPutResult> {
  let res: Response;

  try {
    res = await fetch(`${baseUrl}/player-team/v1/me/state`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        [demoHeaderName]: input.viewerId,
      },
      body: JSON.stringify({
        state: input.state,
        expectedRevision: input.expectedRevision ?? undefined,
      }),
    });
  } catch (e) {
    return {
      ok: false,
      conflict: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (res.status === 409) {
    let actualRevision: number | null = null;
    try {
      const body = (await res.json()) as {
        actualRevision?: number;
        error?: { actualRevision?: number | null; message?: string };
      };
      actualRevision =
        typeof body.error?.actualRevision === 'number'
          ? body.error.actualRevision
          : typeof body.actualRevision === 'number'
            ? body.actualRevision
            : null;
    } catch {
      // ignored
    }
    return { ok: false, conflict: true, actualRevision };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, conflict: false, error: `${res.status} ${body}` };
  }

  const body = (await res.json()) as { readonly revision?: number };

  return {
    ok: true,
    revision: typeof body.revision === 'number' ? body.revision : null,
  };
}
