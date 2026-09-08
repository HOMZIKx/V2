export type FixedHuntRoomPoint = {
  readonly x: number;
  readonly y: number;
};

export type FixedHuntRoute = {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly channel: number;
  readonly points: readonly FixedHuntRoomPoint[];
  readonly updatedAt: number;
};

export type FixedHuntMarker = {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly channel: number;
  readonly kind: 'found';
  readonly location: FixedHuntRoomPoint;
  readonly createdAt: number;
};

export type FixedHuntRequestType = 'pvp' | 'dps' | 'buff';

export type FixedHuntResponder = {
  readonly userId: string;
  readonly displayName: string;
  readonly createdAt: number;
};

export type FixedHuntRequest = {
  readonly id: string;
  readonly type: FixedHuntRequestType;
  readonly channel: number;
  readonly userId: string;
  readonly displayName: string;
  readonly status: string;
  readonly responders: readonly FixedHuntResponder[];
  readonly createdAt: number;
  readonly closedAt: number | null;
};

export type FixedHuntHistoryType =
  | 'killed'
  | 'need_pvp'
  | 'need_dps'
  | 'need_buff'
  | 'coming'
  | 'found'
  | 'request_closed';

export type FixedHuntHistoryEntry = {
  readonly id: string;
  readonly type: FixedHuntHistoryType;
  readonly channel: number;
  readonly userId: string;
  readonly displayName: string;
  readonly createdAt: number;
  readonly requestId?: string;
  readonly requestType?: FixedHuntRequestType;
};

export type FixedHuntRoomState = {
  readonly roomKey: string;
  readonly routes: readonly FixedHuntRoute[];
  readonly markers: readonly FixedHuntMarker[];
  readonly requests: readonly FixedHuntRequest[];
  readonly history: readonly FixedHuntHistoryEntry[];
};

export type FixedHuntRoomSnapshot = {
  readonly roomKey: string;
  readonly state: FixedHuntRoomState;
  readonly revision: number;
  readonly updatedByUserId: string | null;
  readonly updatedAtIso: string;
};

// Production must go through the authenticated same-origin Next proxy.
// Direct browser calls to the Player Team service caused every fixed hunt room
// to fail on Zeabur when NEXT_PUBLIC_PLAYER_TEAM_BASE_URL was absent or blocked
// by cross-origin/network policy. Local development may still override it.
const configuredBaseUrl =
  process.env.NODE_ENV === 'production'
    ? ''
    : (process.env.NEXT_PUBLIC_PLAYER_TEAM_BASE_URL ?? '').trim();
const baseUrl = configuredBaseUrl.replace(/\/$/, '');

function playerTeamUrl(path: string): string {
  return `${baseUrl}${path}`;
}

export class FixedHuntRoomApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null,
  ) {
    super(message);
    this.name = 'FixedHuntRoomApiError';
  }
}

async function apiError(res: Response, operation: string): Promise<FixedHuntRoomApiError> {
  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string };
      message?: string;
    };
    return new FixedHuntRoomApiError(
      `${operation}: ${body.error?.message ?? body.message ?? res.status}`,
      res.status,
      body.error?.code ?? null,
    );
  } catch {
    return new FixedHuntRoomApiError(`${operation}: ${res.status}`, res.status, null);
  }
}

export async function getFixedHuntRoom(input: {
  readonly viewerId: string;
  readonly roomKey: string;
}): Promise<FixedHuntRoomSnapshot> {
  // viewerId stays in the client signature for call-site compatibility. In
  // production identity is resolved by the authenticated server proxy.
  void input.viewerId;

  const res = await fetch(
    playerTeamUrl(`/player-team/v1/fixed-hunt-rooms/${encodeURIComponent(input.roomKey)}`),
    {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
    },
  );
  if (!res.ok) throw await apiError(res, 'getFixedHuntRoom failed');
  return (await res.json()) as FixedHuntRoomSnapshot;
}

export async function putFixedHuntRoom(input: {
  readonly viewerId: string;
  readonly roomKey: string;
  readonly expectedRevision: number;
  readonly state: FixedHuntRoomState;
}): Promise<FixedHuntRoomSnapshot> {
  void input.viewerId;

  const res = await fetch(
    playerTeamUrl(`/player-team/v1/fixed-hunt-rooms/${encodeURIComponent(input.roomKey)}`),
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
  if (!res.ok) throw await apiError(res, 'putFixedHuntRoom failed');
  return (await res.json()) as FixedHuntRoomSnapshot;
}
