import type { RespawnKind, RespawnLocation } from './respawn-timers';

export type PartyVisibility = 'open' | 'closed';
export type PartyRequestStatus = 'pending' | 'accepted' | 'rejected';
export type PartyHuntRole = 'scout' | 'hunter';
/** Scout pin kinds shown in UI: Metin / Boss / Inne. */
export type ScoutPinKind = RespawnKind | 'spot';

/** Scout pin TTL — owner: pinezka aktywna ok. 10 minut, potem znika sama. */
export const PARTY_SCOUT_PIN_TTL_MS = 10 * 60_000;

export const SCOUT_PIN_KIND_PRESETS: readonly {
  readonly kind: ScoutPinKind;
  readonly label: string;
}[] = [
  { kind: 'metin', label: 'Metin' },
  { kind: 'boss', label: 'Boss' },
  { kind: 'spot', label: 'Inne' },
];

export interface MapPartyMember {
  readonly id: string;
  readonly displayName: string;
  readonly role: 'leader' | 'member';
  /** Role inside the active hunt. Independent from party permissions. */
  readonly huntRole: PartyHuntRole;
}

export interface MapPartyRequest {
  readonly id: string;
  readonly displayName: string;
  readonly status: PartyRequestStatus;
}

/**
 * Party hunt session — separate from SpawnTimers (DEC-066/067).
 * Shared session kills; each viewer can focus a map/channel for pins.
 */
export interface MapParty {
  readonly id: string;
  readonly name: string;
  readonly leaderId: string;
  readonly visibility: PartyVisibility;
  readonly joinCode: string;
  readonly mapKey: string;
  readonly activeChannel: number;
  readonly members: readonly MapPartyMember[];
  readonly requests: readonly MapPartyRequest[];
  /** Metiny/bossy zbite w tej sesji party (nie SpawnTimer). */
  readonly sessionKills: number;
}

/** Finder pin: „metin jest tu” — nie lokalizacja zbicia ze SpawnTimerów. */
export interface PartyScoutPin {
  readonly id: string;
  readonly partyId: string;
  readonly mapKey: string;
  readonly channel: number;
  readonly location: RespawnLocation;
  readonly placedAt: number;
  readonly placedBy: string;
  readonly label: string;
  readonly kind: ScoutPinKind;
  /** Hunter who declared „Idę”. Kept on the pin so every party member sees the same claim. */
  readonly claimedBy?: string | null;
  readonly claimedAt?: number | null;
  /** Completed pins stay durable in the shared room but are excluded from the active map. */
  readonly completedBy?: string | null;
  readonly completedAt?: number | null;
}

export function scoutPinKindLabel(kind: ScoutPinKind): string {
  return SCOUT_PIN_KIND_PRESETS.find((item) => item.kind === kind)?.label ?? 'Inne';
}

export function createMapParty(input: {
  readonly leader: Omit<MapPartyMember, 'role' | 'huntRole'>;
  readonly mapKey: string;
  readonly activeChannel: number;
  readonly visibility: PartyVisibility;
  readonly now: number;
}): MapParty {
  const code = String((input.now % 9000) + 1000);
  return {
    id: `party-${input.now}`,
    name: `Party · ${input.mapKey}`,
    leaderId: input.leader.id,
    visibility: input.visibility,
    joinCode: code,
    mapKey: input.mapKey,
    activeChannel: input.activeChannel,
    members: [{ ...input.leader, role: 'leader', huntRole: 'scout' }],
    requests: [],
    sessionKills: 0,
  };
}

/**
 * Local mock join-by-code:
 * - if `savedClosedParty` exists, only its exact `joinCode` rejoins that session;
 * - wrong code → error;
 * - if nothing saved, any non-empty code creates a mock member party labeled with that code.
 */
export function joinPartyByCode(input: {
  readonly code: string;
  readonly savedClosedParty: MapParty | null;
  readonly member: Omit<MapPartyMember, 'role' | 'huntRole'>;
  readonly mapKey: string;
  readonly activeChannel: number;
  readonly now: number;
}):
  | { readonly ok: true; readonly party: MapParty; readonly fromSaved: boolean }
  | { readonly ok: false; readonly error: string } {
  const code = input.code.trim();
  if (!code) {
    return { ok: false, error: 'Podaj kod party.' };
  }

  if (input.savedClosedParty) {
    if (input.savedClosedParty.joinCode !== code) {
      return { ok: false, error: 'Niepoprawny kod party.' };
    }
    const party = input.savedClosedParty;
    if (party.members.some((member) => member.id === input.member.id)) {
      return { ok: true, party, fromSaved: true };
    }
    return {
      ok: true,
      fromSaved: true,
      party: {
        ...party,
        members: [...party.members, { ...input.member, role: 'member', huntRole: 'hunter' }],
      },
    };
  }

  return {
    ok: true,
    fromSaved: false,
    party: {
      id: `party-join-${input.now}`,
      name: `Party · kod ${code}`,
      leaderId: 'remote-leader',
      visibility: 'closed',
      joinCode: code,
      mapKey: input.mapKey,
      activeChannel: input.activeChannel,
      members: [
        {
          id: 'remote-leader',
          displayName: 'Lider (mock)',
          role: 'leader',
          huntRole: 'scout',
        },
        { ...input.member, role: 'member', huntRole: 'hunter' },
      ],
      requests: [],
      sessionKills: 0,
    },
  };
}

export function setPartyMap(party: MapParty, mapKey: string, channel = 1): MapParty {
  return { ...party, mapKey, activeChannel: channel, name: `Party · ${mapKey}` };
}

export function setPartyChannel(party: MapParty, channel: number): MapParty {
  return { ...party, activeChannel: channel };
}

export function setPartyMemberHuntRole(
  party: MapParty,
  memberId: string,
  huntRole: PartyHuntRole,
): MapParty {
  return {
    ...party,
    members: party.members.map((member) =>
      member.id === memberId ? { ...member, huntRole } : member,
    ),
  };
}

export function togglePartyVisibility(party: MapParty): MapParty {
  return { ...party, visibility: party.visibility === 'open' ? 'closed' : 'open' };
}

export function requestPartyJoin(
  party: MapParty,
  request: Omit<MapPartyRequest, 'status'>,
): MapParty {
  if (
    party.members.some((member) => member.id === request.id) ||
    party.requests.some((item) => item.id === request.id)
  ) {
    return party;
  }
  return { ...party, requests: [...party.requests, { ...request, status: 'pending' }] };
}

export function resolvePartyRequest(
  party: MapParty,
  requestId: string,
  accepted: boolean,
): MapParty {
  const request = party.requests.find((item) => item.id === requestId);
  if (!request || request.status !== 'pending') return party;
  return {
    ...party,
    members: accepted
      ? [
          ...party.members,
          { id: request.id, displayName: request.displayName, role: 'member', huntRole: 'hunter' },
        ]
      : party.members,
    requests: party.requests.map((item) =>
      item.id === requestId ? { ...item, status: accepted ? 'accepted' : 'rejected' } : item,
    ),
  };
}

export function incrementSessionKills(party: MapParty, by = 1): MapParty {
  return { ...party, sessionKills: Math.max(0, party.sessionKills + by) };
}

export function resetSessionKills(party: MapParty): MapParty {
  return { ...party, sessionKills: 0 };
}

export function isScoutPinActive(pin: PartyScoutPin, now: number): boolean {
  return pin.completedAt == null && now - pin.placedAt < PARTY_SCOUT_PIN_TTL_MS;
}

export function scoutPinAgeMinutes(pin: PartyScoutPin, now: number): number {
  return Math.max(0, Math.floor((now - pin.placedAt) / 60_000));
}

export function scoutPinRemainingMs(pin: PartyScoutPin, now: number): number {
  return Math.max(0, PARTY_SCOUT_PIN_TTL_MS - (now - pin.placedAt));
}

/** Live countdown for list / selected pin — mm:ss. */
export function formatScoutPinRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1_000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function activeScoutPins(
  pins: readonly PartyScoutPin[],
  party: MapParty | null,
  mapKey: string,
  channel: number,
  now: number,
): readonly PartyScoutPin[] {
  if (!party) return [];
  return pins.filter(
    (pin) =>
      pin.partyId === party.id &&
      pin.mapKey === mapKey &&
      pin.channel === channel &&
      isScoutPinActive(pin, now),
  );
}

/** All still-active scout pins for the party (any map/CH) — sidebar list. */
export function partyActiveScoutPins(
  pins: readonly PartyScoutPin[],
  party: MapParty | null,
  now: number,
): readonly PartyScoutPin[] {
  if (!party) return [];
  return pins.filter((pin) => pin.partyId === party.id && isScoutPinActive(pin, now));
}

/** Completed markers are retained in the room for session history/audit. */
export function partyCompletedScoutPins(
  pins: readonly PartyScoutPin[],
  party: MapParty | null,
): readonly PartyScoutPin[] {
  if (!party) return [];
  return pins.filter((pin) => pin.partyId === party.id && pin.completedAt != null);
}

export function placeScoutPin(
  pins: readonly PartyScoutPin[],
  pin: PartyScoutPin,
): readonly PartyScoutPin[] {
  return [...pins, pin];
}

export function claimScoutPin(
  pins: readonly PartyScoutPin[],
  pinId: string,
  claimedBy: string,
  now: number,
): readonly PartyScoutPin[] {
  return pins.map((pin) =>
    pin.id === pinId && pin.completedAt == null
      ? { ...pin, claimedBy, claimedAt: now }
      : pin,
  );
}

export function releaseScoutPinClaim(
  pins: readonly PartyScoutPin[],
  pinId: string,
  claimedBy: string,
): readonly PartyScoutPin[] {
  return pins.map((pin) =>
    pin.id === pinId && pin.claimedBy === claimedBy && pin.completedAt == null
      ? { ...pin, claimedBy: null, claimedAt: null }
      : pin,
  );
}

export function completeScoutPin(
  pins: readonly PartyScoutPin[],
  pinId: string,
  completedBy: string,
  now: number,
): readonly PartyScoutPin[] {
  return pins.map((pin) =>
    pin.id === pinId && pin.completedAt == null
      ? { ...pin, completedBy, completedAt: now }
      : pin,
  );
}

export function dismissScoutPin(
  pins: readonly PartyScoutPin[],
  pinId: string,
): readonly PartyScoutPin[] {
  return pins.filter((pin) => pin.id !== pinId);
}

/** Drop expired active scout pins so localStorage / UI stay clean. Completed pins are history. */
export function pruneExpiredScoutPins(
  pins: readonly PartyScoutPin[],
  now: number,
): readonly PartyScoutPin[] {
  return pins.filter((pin) => pin.completedAt != null || isScoutPinActive(pin, now));
}

/** @deprecated Use PartyScoutPin + activeScoutPins — kept for old localStorage migration. */
export interface MapSpawnClaim {
  readonly id: string;
  readonly partyId: string;
  readonly mapKey: string;
  readonly channel: number;
  readonly timerKey: string;
  readonly entityName: string;
  readonly kind: RespawnKind;
  readonly location: RespawnLocation;
  readonly claimedAt: number;
  readonly claimedBy: string;
}

export function claimsForPartyScope(
  claims: readonly MapSpawnClaim[],
  party: MapParty | null,
  mapKey: string,
  channel: number,
): readonly MapSpawnClaim[] {
  if (!party) return [];
  return claims.filter(
    (claim) => claim.partyId === party.id && claim.mapKey === mapKey && claim.channel === channel,
  );
}

export function upsertSpawnClaim(
  claims: readonly MapSpawnClaim[],
  claim: MapSpawnClaim,
): readonly MapSpawnClaim[] {
  return [
    ...claims.filter((item) => item.timerKey !== claim.timerKey || item.partyId !== claim.partyId),
    claim,
  ];
}
