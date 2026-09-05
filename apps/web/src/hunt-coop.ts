import type { MapParty, PartyScoutPin, ScoutPinKind } from './map-party';
import { PARTY_SCOUT_PIN_TTL_MS, isScoutPinActive, pruneExpiredScoutPins } from './map-party';
import type { RespawnLocation } from './respawn-timers';

/** Shared Timers room — metin respawns only (not Party). */
export const HUNT_TIMERS_ROOM_KIND = 'timers-room' as const;
/** Shared Party room — join code + scout pins (not Timers). */
export const HUNT_PARTY_ROOM_KIND = 'party-room' as const;

export const HUNT_CLIENT_ID_STORAGE_KEY = 'destiled:hunt-client-id:v1';
export const HUNT_COOP_POLL_MS = 2_500;

export type HuntTimerEntry = {
  readonly timerId: string;
  readonly confirmedAt: number | null;
  readonly confirmedBy: string | null;
  readonly location: RespawnLocation | null;
  readonly updatedAt: number;
  readonly updatedBy: string;
  readonly idempotencyKey?: string;
};

export type HuntTimersRoomState = {
  readonly kind: typeof HUNT_TIMERS_ROOM_KIND;
  readonly mapKey: string;
  readonly channel: number;
  readonly timers: Readonly<Record<string, HuntTimerEntry>>;
  readonly updatedAt: number;
  readonly updatedBy: string;
};

export type HuntPartyRoomState = {
  readonly kind: typeof HUNT_PARTY_ROOM_KIND;
  readonly party: MapParty;
  readonly pins: readonly PartyScoutPin[];
  readonly updatedAt: number;
  readonly updatedBy: string;
};

export function timersRoomKey(mapKey: string, channel: number): string {
  return `timers:${mapKey}:CH${channel}`;
}

/** Demo-viewer id for room-scoped /me/state bridge (until dedicated hunt routes are live). */
export function timersRoomOwnerId(mapKey: string, channel: number): string {
  return `coop-timers:${mapKey}:ch${channel}`;
}

export function partyRoomOwnerId(joinCode: string): string {
  return `coop-party:${normalizeJoinCode(joinCode)}`;
}

export function normalizeJoinCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function generateJoinCode(now = Date.now(), salt = Math.floor(Math.random() * 1_000_000)): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let n = (now % 1_000_000_000) ^ salt;
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.abs(n + i * 17) % alphabet.length]!;
    n = Math.imul(n, 1103515245) + 12345;
  }
  return out;
}

export function emptyTimersRoom(
  mapKey: string,
  channel: number,
  now = Date.now(),
  by = 'system',
): HuntTimersRoomState {
  return {
    kind: HUNT_TIMERS_ROOM_KIND,
    mapKey,
    channel,
    timers: {},
    updatedAt: now,
    updatedBy: by,
  };
}

export function parseTimersRoom(raw: unknown): HuntTimersRoomState | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.kind !== HUNT_TIMERS_ROOM_KIND) return null;
  if (typeof value.mapKey !== 'string' || typeof value.channel !== 'number') return null;
  const timersRaw = value.timers;
  const timers: Record<string, HuntTimerEntry> = {};
  if (timersRaw && typeof timersRaw === 'object') {
    for (const [timerId, entry] of Object.entries(timersRaw as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const confirmedAt = typeof row.confirmedAt === 'number' ? row.confirmedAt : null;
      const location =
        row.location &&
        typeof row.location === 'object' &&
        typeof (row.location as RespawnLocation).x === 'number' &&
        typeof (row.location as RespawnLocation).y === 'number'
          ? (row.location as RespawnLocation)
          : null;
      const confirmedBy = typeof row.confirmedBy === 'string' ? row.confirmedBy : null;
      timers[timerId] = {
        timerId,
        confirmedAt,
        confirmedBy,
        location,
        updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : confirmedAt ?? 0,
        updatedBy:
          typeof row.updatedBy === 'string' ? row.updatedBy : confirmedBy ?? 'unknown',
        ...(typeof row.idempotencyKey === 'string' ? { idempotencyKey: row.idempotencyKey } : {}),
      };
    }
  }
  return {
    kind: HUNT_TIMERS_ROOM_KIND,
    mapKey: value.mapKey,
    channel: value.channel,
    timers,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    updatedBy: typeof value.updatedBy === 'string' ? value.updatedBy : 'unknown',
  };
}

/**
 * Idempotent kill confirm: same idempotencyKey → no-op keep existing;
 * otherwise replace timer entry and bump room updatedAt.
 */
export function confirmKillInTimersRoom(
  room: HuntTimersRoomState,
  input: {
    readonly timerId: string;
    readonly confirmedAt: number;
    readonly confirmedBy: string;
    readonly location: RespawnLocation | null;
    readonly idempotencyKey: string;
    readonly updatedBy: string;
  },
): { readonly room: HuntTimersRoomState; readonly applied: boolean; readonly duplicate: boolean } {
  const existing = room.timers[input.timerId];
  if (existing?.idempotencyKey && existing.idempotencyKey === input.idempotencyKey) {
    return { room, applied: false, duplicate: true };
  }
  const entry: HuntTimerEntry = {
    timerId: input.timerId,
    confirmedAt: input.confirmedAt,
    confirmedBy: input.confirmedBy,
    location: input.location,
    updatedAt: input.confirmedAt,
    updatedBy: input.updatedBy,
    idempotencyKey: input.idempotencyKey,
  };
  return {
    applied: true,
    duplicate: false,
    room: {
      ...room,
      timers: { ...room.timers, [input.timerId]: entry },
      updatedAt: input.confirmedAt,
      updatedBy: input.updatedBy,
    },
  };
}

export function resetTimerInRoom(
  room: HuntTimersRoomState,
  timerId: string,
  updatedBy: string,
  now = Date.now(),
): HuntTimersRoomState {
  if (!(timerId in room.timers)) return room;
  const nextTimers = { ...room.timers };
  delete nextTimers[timerId];
  return { ...room, timers: nextTimers, updatedAt: now, updatedBy };
}

export function parsePartyRoom(raw: unknown): HuntPartyRoomState | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.kind !== HUNT_PARTY_ROOM_KIND) return null;
  if (!value.party || typeof value.party !== 'object') return null;
  const party = value.party as MapParty;
  if (typeof party.id !== 'string' || typeof party.joinCode !== 'string') return null;
  const pins = Array.isArray(value.pins) ? (value.pins as PartyScoutPin[]) : [];
  return {
    kind: HUNT_PARTY_ROOM_KIND,
    party,
    pins,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    updatedBy: typeof value.updatedBy === 'string' ? value.updatedBy : 'unknown',
  };
}

export function createPartyRoom(input: {
  readonly leader: { readonly id: string; readonly displayName: string };
  readonly mapKey: string;
  readonly activeChannel: number;
  readonly visibility: 'open' | 'closed';
  readonly now: number;
  readonly joinCode?: string;
}): HuntPartyRoomState {
  const joinCode = input.joinCode ?? generateJoinCode(input.now);
  const party: MapParty = {
    id: `party-${joinCode}-${input.now}`,
    name: `Party · ${input.mapKey}`,
    leaderId: input.leader.id,
    visibility: input.visibility,
    joinCode,
    mapKey: input.mapKey,
    activeChannel: input.activeChannel,
    members: [{ ...input.leader, role: 'leader' }],
    requests: [],
    sessionKills: 0,
  };
  return {
    kind: HUNT_PARTY_ROOM_KIND,
    party,
    pins: [],
    updatedAt: input.now,
    updatedBy: input.leader.displayName,
  };
}

export function joinPartyRoom(
  room: HuntPartyRoomState,
  member: { readonly id: string; readonly displayName: string },
  now = Date.now(),
): HuntPartyRoomState {
  if (room.party.members.some((item) => item.id === member.id)) return room;
  return {
    ...room,
    party: {
      ...room.party,
      members: [...room.party.members, { ...member, role: 'member' }],
    },
    updatedAt: now,
    updatedBy: member.displayName,
  };
}

export function leavePartyRoom(
  room: HuntPartyRoomState,
  memberId: string,
  updatedBy: string,
  now = Date.now(),
): HuntPartyRoomState {
  return {
    ...room,
    party: {
      ...room.party,
      members: room.party.members.filter((member) => member.id !== memberId),
    },
    updatedAt: now,
    updatedBy,
  };
}

export function addPinToPartyRoom(
  room: HuntPartyRoomState,
  pin: PartyScoutPin,
  updatedBy: string,
): HuntPartyRoomState {
  return {
    ...room,
    pins: [...room.pins, pin],
    updatedAt: pin.placedAt,
    updatedBy,
  };
}

export function dismissPinInPartyRoom(
  room: HuntPartyRoomState,
  pinId: string,
  updatedBy: string,
  now = Date.now(),
): HuntPartyRoomState {
  return {
    ...room,
    pins: room.pins.filter((pin) => pin.id !== pinId),
    updatedAt: now,
    updatedBy,
  };
}

export function prunePartyRoomPins(room: HuntPartyRoomState, now: number): HuntPartyRoomState {
  const pins = pruneExpiredScoutPins(room.pins, now);
  if (pins.length === room.pins.length) return room;
  return { ...room, pins, updatedAt: now, updatedBy: room.updatedBy };
}

export function activePinsForPartyRoom(
  room: HuntPartyRoomState,
  now: number,
): readonly PartyScoutPin[] {
  return room.pins.filter((pin) => isScoutPinActive(pin, now));
}

export function pinTtlExpired(pin: PartyScoutPin, now: number): boolean {
  return now - pin.placedAt >= PARTY_SCOUT_PIN_TTL_MS;
}

export type ScoutPinDraft = {
  readonly id: string;
  readonly partyId: string;
  readonly mapKey: string;
  readonly channel: number;
  readonly location: RespawnLocation;
  readonly placedAt: number;
  readonly placedBy: string;
  readonly label: string;
  readonly kind: ScoutPinKind;
};

/** Apply shared timer entries onto local RespawnRecord list (metin only). */
export function applyTimersRoomToRecords<T extends {
  readonly key: string;
  readonly kind: string;
  readonly confirmedAt: number | null;
  readonly confirmedBy: string | null;
  readonly location: RespawnLocation | null;
}>(records: readonly T[], room: HuntTimersRoomState | null): readonly T[] {
  if (!room) return records;
  return records.map((record) => {
    if (record.kind !== 'metin') return record;
    const entry = room.timers[record.key];
    if (!entry) return record;
    return {
      ...record,
      confirmedAt: entry.confirmedAt,
      confirmedBy: entry.confirmedBy,
      location: entry.location ?? record.location,
    };
  });
}

/** Merge local confirmed timers into room document before PUT. */
export function mergeRecordsIntoTimersRoom<T extends {
  readonly key: string;
  readonly kind: string;
  readonly confirmedAt: number | null;
  readonly confirmedBy: string | null;
  readonly location: RespawnLocation | null;
}>(
  room: HuntTimersRoomState,
  records: readonly T[],
  updatedBy: string,
  now = Date.now(),
): HuntTimersRoomState {
  let changed = false;
  const timers: Record<string, HuntTimerEntry> = { ...room.timers };
  for (const record of records) {
    if (record.kind !== 'metin' || record.confirmedAt === null) continue;
    const existing = timers[record.key];
    if (existing && existing.confirmedAt !== null && existing.confirmedAt >= record.confirmedAt) {
      continue;
    }
    timers[record.key] = {
      timerId: record.key,
      confirmedAt: record.confirmedAt,
      confirmedBy: record.confirmedBy,
      location: record.location,
      updatedAt: now,
      updatedBy,
      ...(existing?.idempotencyKey ? { idempotencyKey: existing.idempotencyKey } : {}),
    };
    changed = true;
  }
  if (!changed) return room;
  return { ...room, timers, updatedAt: now, updatedBy };
}
