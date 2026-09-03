import type { RespawnKind, RespawnLocation } from './respawn-timers';

export type PartyVisibility = 'open' | 'closed';
export type PartyRequestStatus = 'pending' | 'accepted' | 'rejected';

/** Scout pin TTL — owner: pinezka aktywna ok. 10 minut, potem znika sama. */
export const PARTY_SCOUT_PIN_TTL_MS = 10 * 60_000;

export interface MapPartyMember {
  readonly id: string;
  readonly displayName: string;
  readonly role: 'leader' | 'member';
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
  readonly kind: RespawnKind | 'spot';
}

export function createMapParty(input: {
  readonly leader: Omit<MapPartyMember, 'role'>;
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
    members: [{ ...input.leader, role: 'leader' }],
    requests: [],
    sessionKills: 0,
  };
}

export function setPartyMap(party: MapParty, mapKey: string, channel = 1): MapParty {
  return { ...party, mapKey, activeChannel: channel, name: `Party · ${mapKey}` };
}

export function setPartyChannel(party: MapParty, channel: number): MapParty {
  return { ...party, activeChannel: channel };
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
      ? [...party.members, { id: request.id, displayName: request.displayName, role: 'member' }]
      : party.members,
    requests: party.requests.map((item) =>
      item.id === requestId ? { ...item, status: accepted ? 'accepted' : 'rejected' } : item,
    ),
  };
}

export function incrementSessionKills(party: MapParty, by = 1): MapParty {
  return { ...party, sessionKills: Math.max(0, party.sessionKills + by) };
}

export function isScoutPinActive(pin: PartyScoutPin, now: number): boolean {
  return now - pin.placedAt < PARTY_SCOUT_PIN_TTL_MS;
}

export function scoutPinAgeMinutes(pin: PartyScoutPin, now: number): number {
  return Math.max(0, Math.floor((now - pin.placedAt) / 60_000));
}

export function scoutPinRemainingMs(pin: PartyScoutPin, now: number): number {
  return Math.max(0, PARTY_SCOUT_PIN_TTL_MS - (now - pin.placedAt));
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

export function placeScoutPin(
  pins: readonly PartyScoutPin[],
  pin: PartyScoutPin,
): readonly PartyScoutPin[] {
  return [...pins, pin];
}

export function dismissScoutPin(
  pins: readonly PartyScoutPin[],
  pinId: string,
): readonly PartyScoutPin[] {
  return pins.filter((pin) => pin.id !== pinId);
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
