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
  if (!res.ok) throw await apiError(res, 'getMetinGeneralHunt failed');
  return (await res.json()) as MetinGeneralHuntSnapshot;
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
  if (!res.ok) throw await apiError(res, 'putMetinGeneralHunt failed');
  return (await res.json()) as MetinGeneralHuntSnapshot;
}
