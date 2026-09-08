export type MetinGeneralHuntPoint = {
  readonly x: number;
  readonly y: number;
};

export type MetinGeneralHuntRoute = {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly channel: number;
  readonly points: readonly MetinGeneralHuntPoint[];
  readonly updatedAt: number;
};

export type MetinGeneralHuntMarker = {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly channel: number;
  readonly kind: 'found';
  readonly location: MetinGeneralHuntPoint;
  readonly createdAt: number;
};

export type MetinGeneralHuntRequestType = 'pvp' | 'dps' | 'buff';

export type MetinGeneralHuntResponder = {
  readonly userId: string;
  readonly displayName: string;
  readonly createdAt: number;
};

export type MetinGeneralHuntRequest = {
  readonly id: string;
  readonly type: MetinGeneralHuntRequestType;
  readonly channel: number;
  readonly userId: string;
  readonly displayName: string;
  readonly status: string;
  readonly responders: readonly MetinGeneralHuntResponder[];
  readonly createdAt: number;
  readonly closedAt: number | null;
};

export type MetinGeneralHuntHistoryType =
  | 'killed'
  | 'need_pvp'
  | 'need_dps'
  | 'need_buff'
  | 'coming'
  | 'found'
  | 'request_closed';

export type MetinGeneralHuntHistoryEntry = {
  readonly id: string;
  readonly type: MetinGeneralHuntHistoryType;
  readonly channel: number;
  readonly userId: string;
  readonly displayName: string;
  readonly createdAt: number;
  readonly requestId?: string;
  readonly requestType?: MetinGeneralHuntRequestType;
};

export type MetinGeneralHuntState = {
  readonly huntKey: string;
  readonly routes: readonly MetinGeneralHuntRoute[];
  readonly markers: readonly MetinGeneralHuntMarker[];
  readonly requests: readonly MetinGeneralHuntRequest[];
  readonly history: readonly MetinGeneralHuntHistoryEntry[];
};

export type MetinGeneralHuntSnapshot = {
  readonly huntKey: string;
  readonly state: MetinGeneralHuntState;
  readonly revision: number;
  readonly updatedByUserId: string | null;
  readonly updatedAtIso: string;
};

type LegacyFixedHuntRoomState = Omit<MetinGeneralHuntState, 'huntKey'> & {
  readonly roomKey: string;
};

type LegacyFixedHuntRoomSnapshot = Omit<MetinGeneralHuntSnapshot, 'huntKey' | 'state'> & {
  readonly roomKey: string;
  readonly state: LegacyFixedHuntRoomState;
};

const configuredBaseUrl =
  process.env.NODE_ENV === 'production'
    ? ''
    : (process.env.NEXT_PUBLIC_PLAYER_TEAM_BASE_URL ?? '').trim();
const baseUrl = configuredBaseUrl.replace(/\/$/, '');

function playerTeamUrl(path: string): string {
  return `${baseUrl}${path}`;
}

export class MetinGeneralHuntApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null,
  ) {
    super(message);
    this.name = 'MetinGeneralHuntApiError';
  }
}

async function apiError(res: Response, operation: string): Promise<MetinGeneralHuntApiError> {
  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string };
      message?: string;
    };
    return new MetinGeneralHuntApiError(
      `${operation}: ${body.error?.message ?? body.message ?? res.status}`,
      res.status,
      body.error?.code ?? null,
    );
  } catch {
    return new MetinGeneralHuntApiError(`${operation}: ${res.status}`, res.status, null);
  }
}

async function dedicatedRouteIsMissing(res: Response, method: 'GET' | 'PUT'): Promise<boolean> {
  if (res.status !== 404) return false;
  try {
    const body = (await res.clone().json()) as { readonly message?: unknown };
    return (
      typeof body.message === 'string' &&
      body.message.startsWith(`Cannot ${method} /player-team/v1/metin-general-hunts/`)
    );
  } catch {
    return false;
  }
}

function fromLegacySnapshot(
  huntKey: string,
  snapshot: LegacyFixedHuntRoomSnapshot,
): MetinGeneralHuntSnapshot {
  const { roomKey: _roomKey, ...legacyState } = snapshot.state;
  void _roomKey;
  return {
    huntKey,
    state: {
      ...legacyState,
      huntKey,
    },
    revision: snapshot.revision,
    updatedByUserId: snapshot.updatedByUserId,
    updatedAtIso: snapshot.updatedAtIso,
  };
}

function toLegacyState(state: MetinGeneralHuntState): LegacyFixedHuntRoomState {
  const { huntKey, ...rest } = state;
  return {
    ...rest,
    roomKey: huntKey,
  };
}

async function getLegacyFallback(huntKey: string): Promise<MetinGeneralHuntSnapshot> {
  const fallback = await fetch(
    playerTeamUrl(`/player-team/v1/fixed-hunt-rooms/${encodeURIComponent(huntKey)}`),
    {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
    },
  );
  if (!fallback.ok) throw await apiError(fallback, 'getMetinGeneralHunt fallback failed');
  return fromLegacySnapshot(huntKey, (await fallback.json()) as LegacyFixedHuntRoomSnapshot);
}

async function putLegacyFallback(input: {
  readonly huntKey: string;
  readonly expectedRevision: number;
  readonly state: MetinGeneralHuntState;
}): Promise<MetinGeneralHuntSnapshot> {
  const fallback = await fetch(
    playerTeamUrl(`/player-team/v1/fixed-hunt-rooms/${encodeURIComponent(input.huntKey)}`),
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        expectedRevision: input.expectedRevision,
        state: toLegacyState(input.state),
      }),
    },
  );
  if (!fallback.ok) throw await apiError(fallback, 'putMetinGeneralHunt fallback failed');
  return fromLegacySnapshot(
    input.huntKey,
    (await fallback.json()) as LegacyFixedHuntRoomSnapshot,
  );
}

export async function getMetinGeneralHunt(input: {
  readonly viewerId: string;
  readonly huntKey: string;
}): Promise<MetinGeneralHuntSnapshot> {
  void input.viewerId;

  const res = await fetch(
    playerTeamUrl(`/player-team/v1/metin-general-hunts/${encodeURIComponent(input.huntKey)}`),
    {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
    },
  );
  if (res.ok) return (await res.json()) as MetinGeneralHuntSnapshot;

  // Rolling-deploy compatibility: the web can be newer than Player Team on Zeabur.
  // Use the historical endpoint only when Nest explicitly says the new route itself
  // is missing. Once Player Team deploys the dedicated route this path is never used.
  if (await dedicatedRouteIsMissing(res, 'GET')) {
    return getLegacyFallback(input.huntKey);
  }

  throw await apiError(res, 'getMetinGeneralHunt failed');
}

export async function putMetinGeneralHunt(input: {
  readonly viewerId: string;
  readonly huntKey: string;
  readonly expectedRevision: number;
  readonly state: MetinGeneralHuntState;
}): Promise<MetinGeneralHuntSnapshot> {
  void input.viewerId;

  const res = await fetch(
    playerTeamUrl(`/player-team/v1/metin-general-hunts/${encodeURIComponent(input.huntKey)}`),
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        expectedRevision: input.expectedRevision,
        state: input.state,
      }),
    },
  );
  if (res.ok) return (await res.json()) as MetinGeneralHuntSnapshot;

  if (await dedicatedRouteIsMissing(res, 'PUT')) {
    return putLegacyFallback(input);
  }

  throw await apiError(res, 'putMetinGeneralHunt failed');
}
