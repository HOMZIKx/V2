/**
 * Personal Timers / Party prefs cached on the player-team /me/state snapshot.
 * Shared rooms are the multi-browser source of truth when joined; these fields
 * are personal prefs + offline fallback only (do not collide with EQ schemas).
 */

import type { MapParty, PartyScoutPin } from './map-party';
import type { RespawnRecord } from './respawn-timers';
import type { MetinCountOverrides } from './timers-metin-counts';
import { parseMetinCountOverrides } from './timers-metin-counts';

export const MAP_HUNT_SNAPSHOT_VERSION = 1 as const;
export const PARTY_HUNT_SNAPSHOT_VERSION = 1 as const;

export type MapHuntRecordStore = Readonly<Record<string, readonly RespawnRecord[]>>;

export interface MapHuntSnapshotV1 {
  readonly version: typeof MAP_HUNT_SNAPSHOT_VERSION;
  readonly mapKey: string;
  readonly channel: number;
  readonly filter?: 'all' | 'active';
  readonly miniMode?: boolean;
  /** Confirmed timer overrides keyed by `mapKey:chN` — offline / personal cache. */
  readonly store: MapHuntRecordStore;
  readonly metinCounts: MetinCountOverrides;
  readonly updatedAtIso: string;
}

export interface PartyHuntSnapshotV1 {
  readonly version: typeof PARTY_HUNT_SNAPSHOT_VERSION;
  readonly mapKey: string;
  readonly channel: number;
  readonly miniMode?: boolean;
  /** Last joined shared room id (when using player-team party rooms). */
  readonly partyRoomId?: string | null;
  readonly lastJoinCode?: string | null;
  /** Offline / personal cache of party session. */
  readonly party: MapParty | null;
  readonly pins: readonly PartyScoutPin[];
  readonly savedClosedParty: MapParty | null;
  readonly updatedAtIso: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asRecordStore(value: unknown): MapHuntRecordStore {
  if (!isPlainObject(value)) return {};
  const out: Record<string, RespawnRecord[]> = {};
  for (const [key, list] of Object.entries(value)) {
    if (!Array.isArray(list)) continue;
    out[key] = list.filter(
      (record): record is RespawnRecord =>
        isPlainObject(record) &&
        typeof record.key === 'string' &&
        typeof record.mapKey === 'string' &&
        typeof record.channel === 'number',
    ) as RespawnRecord[];
  }
  return out;
}

export function parseMapHuntSnapshot(raw: unknown): MapHuntSnapshotV1 | null {
  if (!isPlainObject(raw)) return null;
  if (raw.version !== MAP_HUNT_SNAPSHOT_VERSION) return null;
  if (typeof raw.mapKey !== 'string' || raw.mapKey.length === 0) return null;
  if (typeof raw.channel !== 'number' || !Number.isFinite(raw.channel)) return null;
  const filter =
    raw.filter === 'all' || raw.filter === 'active' ? raw.filter : undefined;
  const snap: MapHuntSnapshotV1 = {
    version: MAP_HUNT_SNAPSHOT_VERSION,
    mapKey: raw.mapKey,
    channel: Math.max(1, Math.trunc(raw.channel)),
    miniMode: raw.miniMode === true,
    store: asRecordStore(raw.store),
    metinCounts: parseMetinCountOverrides(raw.metinCounts),
    updatedAtIso:
      typeof raw.updatedAtIso === 'string' && raw.updatedAtIso.length > 0
        ? raw.updatedAtIso
        : new Date().toISOString(),
    ...(filter !== undefined ? { filter } : {}),
  };
  return snap;
}

export function parsePartyHuntSnapshot(raw: unknown): PartyHuntSnapshotV1 | null {
  if (!isPlainObject(raw)) return null;
  if (raw.version !== PARTY_HUNT_SNAPSHOT_VERSION) return null;
  if (typeof raw.mapKey !== 'string' || raw.mapKey.length === 0) return null;
  if (typeof raw.channel !== 'number' || !Number.isFinite(raw.channel)) return null;
  const party =
    raw.party === null || isPlainObject(raw.party) ? (raw.party as MapParty | null) : null;
  const savedClosedParty =
    raw.savedClosedParty === null || isPlainObject(raw.savedClosedParty)
      ? (raw.savedClosedParty as MapParty | null)
      : null;
  const pins = Array.isArray(raw.pins)
    ? (raw.pins.filter((pin) => isPlainObject(pin) && typeof pin.id === 'string') as PartyScoutPin[])
    : [];
  const partyRoomId =
    typeof raw.partyRoomId === 'string'
      ? raw.partyRoomId
      : raw.partyRoomId === null
        ? null
        : undefined;
  const lastJoinCode =
    typeof raw.lastJoinCode === 'string'
      ? raw.lastJoinCode
      : raw.lastJoinCode === null
        ? null
        : undefined;
  const snap: PartyHuntSnapshotV1 = {
    version: PARTY_HUNT_SNAPSHOT_VERSION,
    mapKey: raw.mapKey,
    channel: Math.max(1, Math.trunc(raw.channel)),
    miniMode: raw.miniMode === true,
    party,
    pins,
    savedClosedParty,
    updatedAtIso:
      typeof raw.updatedAtIso === 'string' && raw.updatedAtIso.length > 0
        ? raw.updatedAtIso
        : new Date().toISOString(),
    ...(partyRoomId !== undefined ? { partyRoomId } : {}),
    ...(lastJoinCode !== undefined ? { lastJoinCode } : {}),
  };
  return snap;
}

/** Merge optional top-level hunt fields from a raw server/local object into store shape. */
export function extractHuntFieldsFromState(state: Record<string, unknown> | null | undefined): {
  readonly mapHunt: MapHuntSnapshotV1 | null;
  readonly partyHunt: PartyHuntSnapshotV1 | null;
} {
  if (!state) return { mapHunt: null, partyHunt: null };
  return {
    mapHunt: parseMapHuntSnapshot(state.mapHunt),
    partyHunt: parsePartyHuntSnapshot(state.partyHunt),
  };
}

/**
 * Merge only mapHunt / partyHunt into a full snapshot object without touching EQ keys.
 * Used by Timers/Party PUT path and by EQ sync to preserve hunt fields.
 */
export function mergeHuntFieldsIntoState(
  base: Record<string, unknown>,
  patch: {
    readonly mapHunt?: MapHuntSnapshotV1 | null;
    readonly partyHunt?: PartyHuntSnapshotV1 | null;
  },
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...base };
  if (patch.mapHunt !== undefined) {
    if (patch.mapHunt === null) delete next.mapHunt;
    else next.mapHunt = patch.mapHunt;
  }
  if (patch.partyHunt !== undefined) {
    if (patch.partyHunt === null) delete next.partyHunt;
    else next.partyHunt = patch.partyHunt;
  }
  return next;
}

/** Prefer local hunt fields when present; otherwise keep server's. */
export function preserveHuntFieldsOnPut(
  localState: Record<string, unknown>,
  serverState: Record<string, unknown> | null,
): Record<string, unknown> {
  const server = serverState ?? {};
  const localHunt = extractHuntFieldsFromState(localState);
  const serverHunt = extractHuntFieldsFromState(server);
  return mergeHuntFieldsIntoState(
    { ...server, ...localState },
    {
      mapHunt: localHunt.mapHunt ?? serverHunt.mapHunt,
      partyHunt: localHunt.partyHunt ?? serverHunt.partyHunt,
    },
  );
}
