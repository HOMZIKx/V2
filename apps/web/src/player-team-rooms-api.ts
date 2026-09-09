/**
 * Shared Timers + Party rooms via player-team-service (REST + polling, no WS).
 */

export type PartyHuntRole = 'scout' | 'hunter';

export type PartyRoomMember = {
  readonly id: string;
  readonly displayName: string;
  readonly role: 'leader' | 'member';
  readonly huntRole: PartyHuntRole;
};

export type PartyRoomPin = {
  readonly id: string;
  readonly partyId: string;
  readonly mapKey: string;
  readonly channel: number;
  readonly location: { readonly x: number; readonly y: number };
  readonly placedAt: number;
  readonly placedBy: string;
  readonly label: string;
  readonly kind: 'metin' | 'boss' | 'spot';
  readonly claimedBy?: string | null;
  readonly claimedAt?: number | null;
  readonly completedBy?: string | null;
  readonly completedAt?: number | null;
};

export type PartyRoomSnapshot = {
  readonly id: string;
  readonly joinCode: string;
  readonly name: string;
  readonly leaderId: string;
  readonly visibility: 'open' | 'closed';
  readonly mapKey: string;
  readonly activeChannel: number;
  readonly sessionKills: number;
  readonly members: readonly PartyRoomMember[];
  readonly requests: readonly {
    readonly id: string;
    readonly displayName: string;
    readonly status: 'pending' | 'accepted' | 'rejected';
  }[];
  readonly pins: readonly PartyRoomPin[];
  readonly revision: number;
  readonly updatedAtIso: string;
};

export type TimerRoomRecord = {
  readonly key: string;
  readonly mapKey: string;
  readonly channel: number;
  readonly kind: 'boss' | 'metin';
  readonly entityName?: string;
  readonly confirmedAt: number | null;
  readonly confirmedBy: string | null;
  readonly location: { readonly x: number; readonly y: number } | null;
  readonly operationId?: string | null;
};

export type TimerRoomSnapshot = {
  readonly id: string;
  readonly mapKey: string;
  readonly channel: number;
  readonly roomCode: string | null;
  readonly timers: Readonly<Record<string, TimerRoomRecord>>;
  readonly revision: number;
  readonly updatedAtIso: string;
};

// Production Timers/Party requests always use the authenticated same-origin
// Next proxy. A direct base URL is retained only for explicit local/dev work.
const configuredBaseUrl =
  process.env.NODE_ENV === 'production'
    ? ''
    : (process.env.NEXT_PUBLIC_PLAYER_TEAM_BASE_URL ?? '').trim();
const baseUrl = configuredBaseUrl.replace(/\/$/, '');

const demoHeaderName = (
  (process.env.NEXT_PUBLIC_PLAYER_TEAM_DEMO_VIEWER_HEADER ?? '').trim() || 'x-demo-viewer-id'
).toLowerCase();

const requestCredentials: RequestCredentials = baseUrl.length === 0 ? 'include' : 'same-origin';

function headers(viewerId: string, json = false): HeadersInit {
  const h: Record<string, string> = {};
  // Only direct local/dev calls use the compatibility identity. Production
  // identity is resolved server-side by /player-team/[...path].
  if (baseUrl.length > 0) h[demoHeaderName] = viewerId;
  if (json) h['content-type'] = 'application/json';
  return h;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `${res.status}`;
  } catch {
    return `${res.status}`;
  }
}

export async function createPartyRoom(input: {
  readonly viewerId: string;
  readonly displayName: string;
  readonly mapKey: string;
  readonly activeChannel: number;
  readonly visibility: 'open' | 'closed';
}): Promise<PartyRoomSnapshot> {
  const res = await fetch(`${baseUrl}/player-team/v1/party-rooms`, {
    method: 'POST',
    headers: headers(input.viewerId, true),
    credentials: requestCredentials,
    body: JSON.stringify({
      displayName: input.displayName,
      mapKey: input.mapKey,
      activeChannel: input.activeChannel,
      visibility: input.visibility,
    }),
  });
  if (!res.ok) throw new Error(`createPartyRoom failed: ${await readError(res)}`);
  return (await res.json()) as PartyRoomSnapshot;
}

export async function joinPartyRoom(input: {
  readonly viewerId: string;
  readonly displayName: string;
  readonly joinCode: string;
}): Promise<PartyRoomSnapshot> {
  const res = await fetch(`${baseUrl}/player-team/v1/party-rooms/join`, {
    method: 'POST',
    headers: headers(input.viewerId, true),
    credentials: requestCredentials,
    body: JSON.stringify({
      displayName: input.displayName,
      joinCode: input.joinCode,
    }),
  });
  if (!res.ok) throw new Error(`joinPartyRoom failed: ${await readError(res)}`);
  return (await res.json()) as PartyRoomSnapshot;
}

export async function getPartyRoom(input: {
  readonly viewerId: string;
  readonly roomId: string;
}): Promise<PartyRoomSnapshot> {
  const res = await fetch(
    `${baseUrl}/player-team/v1/party-rooms/${encodeURIComponent(input.roomId)}`,
    {
      method: 'GET',
      headers: headers(input.viewerId),
      credentials: requestCredentials,
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(`getPartyRoom failed: ${await readError(res)}`);
  return (await res.json()) as PartyRoomSnapshot;
}

export async function leavePartyRoom(input: {
  readonly viewerId: string;
  readonly roomId: string;
}): Promise<void> {
  const res = await fetch(
    `${baseUrl}/player-team/v1/party-rooms/${encodeURIComponent(input.roomId)}/leave`,
    {
      method: 'POST',
      headers: headers(input.viewerId, true),
      credentials: requestCredentials,
      body: '{}',
    },
  );
  if (!res.ok) throw new Error(`leavePartyRoom failed: ${await readError(res)}`);
}

export async function patchPartyRoom(input: {
  readonly viewerId: string;
  readonly roomId: string;
  readonly expectedRevision: number;
  readonly patch: {
    readonly mapKey?: string;
    readonly activeChannel?: number;
    readonly sessionKills?: number;
    readonly sessionKillsDelta?: number;
    readonly visibility?: 'open' | 'closed';
    readonly requests?: PartyRoomSnapshot['requests'];
  };
}): Promise<PartyRoomSnapshot> {
  const post = (expectedRevision: number) =>
    fetch(`${baseUrl}/player-team/v1/party-rooms/${encodeURIComponent(input.roomId)}`, {
      method: 'PATCH',
      headers: headers(input.viewerId, true),
      credentials: requestCredentials,
      body: JSON.stringify({
        expectedRevision,
        ...input.patch,
      }),
    });

  let res = await post(input.expectedRevision);
  const isKillIncrementOnly =
    input.patch.sessionKillsDelta === 1 &&
    input.patch.mapKey === undefined &&
    input.patch.activeChannel === undefined &&
    input.patch.sessionKills === undefined &&
    input.patch.visibility === undefined &&
    input.patch.requests === undefined;

  if (res.status === 409 && isKillIncrementOnly) {
    // Session +1 is a commutative action. If another member changed the room
    // between poll and click, refresh the revision and replay this one increment.
    const latest = await getPartyRoom({ viewerId: input.viewerId, roomId: input.roomId });
    res = await post(latest.revision);
  }

  if (!res.ok) throw new Error(`patchPartyRoom failed: ${await readError(res)}`);
  return (await res.json()) as PartyRoomSnapshot;
}

export async function setPartyRoomHuntRole(input: {
  readonly viewerId: string;
  readonly roomId: string;
  readonly huntRole: PartyHuntRole;
}): Promise<PartyRoomSnapshot> {
  const res = await fetch(
    `${baseUrl}/player-team/v1/party-rooms/${encodeURIComponent(input.roomId)}/hunt-role`,
    {
      method: 'PATCH',
      headers: headers(input.viewerId, true),
      credentials: requestCredentials,
      body: JSON.stringify({ huntRole: input.huntRole }),
    },
  );
  if (!res.ok) throw new Error(`setPartyRoomHuntRole failed: ${await readError(res)}`);
  return (await res.json()) as PartyRoomSnapshot;
}

export async function addPartyRoomPin(input: {
  readonly viewerId: string;
  readonly roomId: string;
  readonly pin: Omit<PartyRoomPin, 'partyId'> & { readonly partyId?: string };
}): Promise<PartyRoomSnapshot> {
  const res = await fetch(
    `${baseUrl}/player-team/v1/party-rooms/${encodeURIComponent(input.roomId)}/pins`,
    {
      method: 'POST',
      headers: headers(input.viewerId, true),
      credentials: requestCredentials,
      body: JSON.stringify({ pin: input.pin }),
    },
  );
  if (!res.ok) throw new Error(`addPartyRoomPin failed: ${await readError(res)}`);
  return (await res.json()) as PartyRoomSnapshot;
}

export async function patchPartyRoomPin(input: {
  readonly viewerId: string;
  readonly roomId: string;
  readonly pinId: string;
  readonly patch: {
    readonly claimedBy?: string | null;
    readonly claimedAt?: number | null;
    readonly completedBy?: string | null;
    readonly completedAt?: number | null;
  };
}): Promise<PartyRoomSnapshot> {
  const res = await fetch(
    `${baseUrl}/player-team/v1/party-rooms/${encodeURIComponent(input.roomId)}/pins/${encodeURIComponent(input.pinId)}`,
    {
      method: 'PATCH',
      headers: headers(input.viewerId, true),
      credentials: requestCredentials,
      body: JSON.stringify(input.patch),
    },
  );
  if (!res.ok) throw new Error(`patchPartyRoomPin failed: ${await readError(res)}`);
  return (await res.json()) as PartyRoomSnapshot;
}

export async function removePartyRoomPin(input: {
  readonly viewerId: string;
  readonly roomId: string;
  readonly pinId: string;
}): Promise<PartyRoomSnapshot> {
  const res = await fetch(
    `${baseUrl}/player-team/v1/party-rooms/${encodeURIComponent(input.roomId)}/pins/${encodeURIComponent(input.pinId)}`,
    {
      method: 'DELETE',
      headers: headers(input.viewerId),
      credentials: requestCredentials,
    },
  );
  if (!res.ok) throw new Error(`removePartyRoomPin failed: ${await readError(res)}`);
  return (await res.json()) as PartyRoomSnapshot;
}

export async function getOrCreateTimerRoom(input: {
  readonly viewerId: string;
  readonly mapKey: string;
  readonly channel: number;
  readonly roomCode?: string | null;
}): Promise<TimerRoomSnapshot> {
  const params = new URLSearchParams();
  if (input.roomCode) params.set('roomCode', input.roomCode);
  const qs = params.toString();
  const path = `${baseUrl}/player-team/v1/timer-rooms/${encodeURIComponent(input.mapKey)}/${input.channel}${qs ? `?${qs}` : ''}`;
  const res = await fetch(path, {
    method: 'GET',
    headers: headers(input.viewerId),
    credentials: requestCredentials,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`getOrCreateTimerRoom failed: ${await readError(res)}`);
  return (await res.json()) as TimerRoomSnapshot;
}

export async function confirmTimerKill(input: {
  readonly viewerId: string;
  readonly mapKey: string;
  readonly channel: number;
  readonly roomCode?: string | null;
  readonly record: TimerRoomRecord;
  readonly operationId: string;
  readonly expectedRevision?: number | null;
}): Promise<TimerRoomSnapshot> {
  const post = (expectedRevision: number | null) =>
    fetch(
      `${baseUrl}/player-team/v1/timer-rooms/${encodeURIComponent(input.mapKey)}/${input.channel}/confirm-kill`,
      {
        method: 'POST',
        headers: headers(input.viewerId, true),
        credentials: requestCredentials,
        body: JSON.stringify({
          roomCode: input.roomCode ?? null,
          record: input.record,
          operationId: input.operationId,
          expectedRevision: expectedRevision ?? undefined,
        }),
      },
    );

  let res = await post(input.expectedRevision ?? null);
  if (res.status === 409) {
    // Another online user changed the same map/CH between poll and click.
    // Refresh revision and replay the idempotent operation once instead of
    // dropping this user's confirmation.
    const latest = await getOrCreateTimerRoom({
      viewerId: input.viewerId,
      mapKey: input.mapKey,
      channel: input.channel,
      roomCode: input.roomCode ?? null,
    });
    res = await post(latest.revision);
  }
  if (!res.ok) throw new Error(`confirmTimerKill failed: ${await readError(res)}`);
  return (await res.json()) as TimerRoomSnapshot;
}
