import {
  emptyTimersRoom,
  parsePartyRoom,
  parseTimersRoom,
  partyRoomOwnerId,
  timersRoomOwnerId,
  type HuntPartyRoomState,
  type HuntTimersRoomState,
} from './hunt-coop';
import {
  getMyPlayerTeamState,
  putMyPlayerTeamState,
  type PlayerTeamPutResult,
} from './player-team-online-api';

export type HuntCoopStatus = 'offline' | 'connecting' | 'online' | 'error';

export type HuntRoomGetResult<T> =
  | { readonly ok: true; readonly state: T | null; readonly revision: number | null; readonly via: 'hunt' | 'snapshot' }
  | { readonly ok: false; readonly error: string };

const baseUrl =
  (process.env.NEXT_PUBLIC_PLAYER_TEAM_BASE_URL ?? '').trim() || 'http://127.0.0.1:4400';

const demoHeaderName = (
  (process.env.NEXT_PUBLIC_PLAYER_TEAM_DEMO_VIEWER_HEADER ?? '').trim() || 'x-demo-viewer-id'
).toLowerCase();

export function isHuntCoopConfigured(): boolean {
  const enabled =
    process.env.NEXT_PUBLIC_PLAYER_TEAM_ONLINE_ENABLED === 'true' ||
    (process.env.NODE_ENV !== 'production' &&
      process.env.NEXT_PUBLIC_PLAYER_TEAM_ONLINE_ENABLED !== 'false');
  // Base URL always has a default (127.0.0.1:4400 or Zeabur via env).
  return enabled;
}

/** Prefer explicit flag; default on in non-production when base URL is set. */
export function huntCoopEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_HUNT_COOP_ENABLED === 'false') return false;
  if (process.env.NEXT_PUBLIC_HUNT_COOP_ENABLED === 'true') return true;
  return isHuntCoopConfigured();
}

function huntHeaders(actorViewerId: string): HeadersInit {
  return {
    'content-type': 'application/json',
    [demoHeaderName]: actorViewerId,
  };
}

async function tryGetDedicatedTimers(
  mapKey: string,
  channel: number,
  actorViewerId: string,
): Promise<HuntRoomGetResult<HuntTimersRoomState> | null> {
  try {
    const res = await fetch(
      `${baseUrl}/player-team/v1/hunt/timers/${encodeURIComponent(mapKey)}/${channel}`,
      { method: 'GET', headers: huntHeaders(actorViewerId), cache: 'no-store' },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `hunt timers get ${res.status} ${body}` };
    }
    const body = (await res.json()) as {
      readonly state?: unknown;
      readonly revision?: number;
    };
    return {
      ok: true,
      via: 'hunt',
      state: body.state ? parseTimersRoom(body.state) : null,
      revision: typeof body.revision === 'number' ? body.revision : null,
    };
  } catch {
    return null;
  }
}

async function tryPutDedicatedTimers(input: {
  readonly mapKey: string;
  readonly channel: number;
  readonly actorViewerId: string;
  readonly state: HuntTimersRoomState;
  readonly expectedRevision: number | null;
}): Promise<PlayerTeamPutResult | null> {
  try {
    const res = await fetch(
      `${baseUrl}/player-team/v1/hunt/timers/${encodeURIComponent(input.mapKey)}/${input.channel}`,
      {
        method: 'PUT',
        headers: huntHeaders(input.actorViewerId),
        body: JSON.stringify({
          state: input.state,
          expectedRevision: input.expectedRevision ?? undefined,
        }),
      },
    );
    if (res.status === 404) return null;
    if (res.status === 409) {
      let actualRevision: number | null = null;
      try {
        const body = (await res.json()) as {
          actualRevision?: number;
          error?: { actualRevision?: number | null };
        };
        actualRevision =
          typeof body.error?.actualRevision === 'number'
            ? body.error.actualRevision
            : typeof body.actualRevision === 'number'
              ? body.actualRevision
              : null;
      } catch {
        /* ignore */
      }
      return { ok: false, conflict: true, actualRevision };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, conflict: false, error: `${res.status} ${body}` };
    }
    const body = (await res.json()) as { readonly revision?: number };
    return { ok: true, revision: typeof body.revision === 'number' ? body.revision : null };
  } catch {
    return null;
  }
}

export async function getTimersRoom(input: {
  readonly mapKey: string;
  readonly channel: number;
  readonly actorViewerId: string;
}): Promise<HuntRoomGetResult<HuntTimersRoomState>> {
  const dedicated = await tryGetDedicatedTimers(input.mapKey, input.channel, input.actorViewerId);
  if (dedicated) return dedicated;

  try {
    const snap = await getMyPlayerTeamState({
      viewerId: timersRoomOwnerId(input.mapKey, input.channel),
    });
    return {
      ok: true,
      via: 'snapshot',
      state: snap.state ? parseTimersRoom(snap.state) : null,
      revision: snap.revision,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function putTimersRoom(input: {
  readonly mapKey: string;
  readonly channel: number;
  readonly actorViewerId: string;
  readonly state: HuntTimersRoomState;
  readonly expectedRevision: number | null;
}): Promise<PlayerTeamPutResult> {
  const dedicated = await tryPutDedicatedTimers(input);
  if (dedicated) return dedicated;

  return putMyPlayerTeamState({
    viewerId: timersRoomOwnerId(input.mapKey, input.channel),
    state: input.state as unknown as Record<string, unknown>,
    expectedRevision: input.expectedRevision,
  });
}

export async function ensureTimersRoom(input: {
  readonly mapKey: string;
  readonly channel: number;
  readonly actorViewerId: string;
  readonly displayName: string;
}): Promise<HuntRoomGetResult<HuntTimersRoomState>> {
  const current = await getTimersRoom(input);
  if (!current.ok) return current;
  if (current.state) return current;
  const empty = emptyTimersRoom(input.mapKey, input.channel, Date.now(), input.displayName);
  const put = await putTimersRoom({
    ...input,
    state: empty,
    expectedRevision: null,
  });
  if (!put.ok && !put.conflict) {
    return { ok: false, error: put.error };
  }
  return { ok: true, via: current.via, state: empty, revision: put.ok ? put.revision : null };
}

async function tryGetDedicatedParty(
  code: string,
  actorViewerId: string,
): Promise<HuntRoomGetResult<HuntPartyRoomState> | null> {
  try {
    const res = await fetch(
      `${baseUrl}/player-team/v1/hunt/parties/${encodeURIComponent(code)}`,
      { method: 'GET', headers: huntHeaders(actorViewerId), cache: 'no-store' },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `hunt party get ${res.status} ${body}` };
    }
    const body = (await res.json()) as {
      readonly state?: unknown;
      readonly revision?: number;
    };
    return {
      ok: true,
      via: 'hunt',
      state: body.state ? parsePartyRoom(body.state) : null,
      revision: typeof body.revision === 'number' ? body.revision : null,
    };
  } catch {
    return null;
  }
}

async function tryPutDedicatedParty(input: {
  readonly code: string;
  readonly actorViewerId: string;
  readonly state: HuntPartyRoomState;
  readonly expectedRevision: number | null;
}): Promise<PlayerTeamPutResult | null> {
  try {
    const res = await fetch(
      `${baseUrl}/player-team/v1/hunt/parties/${encodeURIComponent(input.code)}`,
      {
        method: 'PUT',
        headers: huntHeaders(input.actorViewerId),
        body: JSON.stringify({
          state: input.state,
          expectedRevision: input.expectedRevision ?? undefined,
        }),
      },
    );
    if (res.status === 404) return null;
    if (res.status === 409) {
      let actualRevision: number | null = null;
      try {
        const body = (await res.json()) as {
          actualRevision?: number;
          error?: { actualRevision?: number | null };
        };
        actualRevision =
          typeof body.error?.actualRevision === 'number'
            ? body.error.actualRevision
            : typeof body.actualRevision === 'number'
              ? body.actualRevision
              : null;
      } catch {
        /* ignore */
      }
      return { ok: false, conflict: true, actualRevision };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, conflict: false, error: `${res.status} ${body}` };
    }
    const body = (await res.json()) as { readonly revision?: number };
    return { ok: true, revision: typeof body.revision === 'number' ? body.revision : null };
  } catch {
    return null;
  }
}

export async function getPartyRoom(input: {
  readonly code: string;
  readonly actorViewerId: string;
}): Promise<HuntRoomGetResult<HuntPartyRoomState>> {
  const dedicated = await tryGetDedicatedParty(input.code, input.actorViewerId);
  if (dedicated) return dedicated;

  try {
    const snap = await getMyPlayerTeamState({
      viewerId: partyRoomOwnerId(input.code),
    });
    return {
      ok: true,
      via: 'snapshot',
      state: snap.state ? parsePartyRoom(snap.state) : null,
      revision: snap.revision,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function putPartyRoom(input: {
  readonly code: string;
  readonly actorViewerId: string;
  readonly state: HuntPartyRoomState;
  readonly expectedRevision: number | null;
}): Promise<PlayerTeamPutResult> {
  const dedicated = await tryPutDedicatedParty(input);
  if (dedicated) return dedicated;

  return putMyPlayerTeamState({
    viewerId: partyRoomOwnerId(input.code),
    state: input.state as unknown as Record<string, unknown>,
    expectedRevision: input.expectedRevision,
  });
}

/** OCC-aware put with one conflict retry (re-fetch → caller merge → blind retry). */
export async function putTimersRoomWithRetry(input: {
  readonly mapKey: string;
  readonly channel: number;
  readonly actorViewerId: string;
  readonly state: HuntTimersRoomState;
  readonly expectedRevision: number | null;
  readonly mergeOnConflict: (server: HuntTimersRoomState | null) => HuntTimersRoomState;
}): Promise<PlayerTeamPutResult> {
  const first = await putTimersRoom(input);
  if (first.ok || !first.conflict) return first;
  const latest = await getTimersRoom(input);
  if (!latest.ok) return { ok: false, conflict: false, error: latest.error };
  const merged = input.mergeOnConflict(latest.state);
  return putTimersRoom({
    ...input,
    state: merged,
    expectedRevision: null,
  });
}

export async function putPartyRoomWithRetry(input: {
  readonly code: string;
  readonly actorViewerId: string;
  readonly state: HuntPartyRoomState;
  readonly expectedRevision: number | null;
  readonly mergeOnConflict: (server: HuntPartyRoomState | null) => HuntPartyRoomState;
}): Promise<PlayerTeamPutResult> {
  const first = await putPartyRoom(input);
  if (first.ok || !first.conflict) return first;
  const latest = await getPartyRoom(input);
  if (!latest.ok) return { ok: false, conflict: false, error: latest.error };
  const merged = input.mergeOnConflict(latest.state);
  return putPartyRoom({
    ...input,
    state: merged,
    expectedRevision: null,
  });
}

export function ensureHuntClientId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const existing = window.localStorage.getItem('destiled:hunt-client-id:v1');
    if (existing && existing.length > 0) return existing;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem('destiled:hunt-client-id:v1', id);
    return id;
  } catch {
    return `client-${Date.now()}`;
  }
}
