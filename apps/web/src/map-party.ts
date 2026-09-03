import type { RespawnKind, RespawnLocation } from './respawn-timers';

export type PartyVisibility = 'open' | 'closed';
export type PartyRequestStatus = 'pending' | 'accepted' | 'rejected';

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
}

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
    name: `Wyprawa · ${input.mapKey}`,
    leaderId: input.leader.id,
    visibility: input.visibility,
    joinCode: code,
    mapKey: input.mapKey,
    activeChannel: input.activeChannel,
    members: [{ ...input.leader, role: 'leader' }],
    requests: [],
  };
}

export function setPartyMap(party: MapParty, mapKey: string, channel = 1): MapParty {
  return { ...party, mapKey, activeChannel: channel, name: `Wyprawa · ${mapKey}` };
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
  )
    return party;
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
