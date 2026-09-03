import { describe, expect, it } from 'vitest';
import {
  claimsForPartyScope,
  createMapParty,
  requestPartyJoin,
  resolvePartyRequest,
  setPartyMap,
  upsertSpawnClaim,
} from './map-party';

describe('map party', () => {
  const leader = { id: 'mateusz', displayName: 'Mateusz' };

  it('tworzy party na wybranej mapie z liderem', () => {
    const party = createMapParty({
      leader,
      mapKey: 'M1',
      activeChannel: 3,
      visibility: 'closed',
      now: 1_000,
    });
    expect(party.members).toHaveLength(1);
    expect(party.joinCode).toHaveLength(4);
    expect(setPartyMap(party, 'Dolina Orków')).toMatchObject({
      mapKey: 'Dolina Orków',
      activeChannel: 1,
    });
  });

  it('wymaga decyzji lidera dla prośby o wejście', () => {
    const party = createMapParty({
      leader,
      mapKey: 'M1',
      activeChannel: 1,
      visibility: 'open',
      now: 1_000,
    });
    const requested = requestPartyJoin(party, { id: 'wicek', displayName: 'Wicek' });
    expect(requested.members).toHaveLength(1);
    expect(
      resolvePartyRequest(requested, 'wicek', true).members.map((member) => member.id),
    ).toContain('wicek');
  });

  it('pokazuje claim tylko uczestnikom właściwego party, mapy i kanału', () => {
    const party = createMapParty({
      leader,
      mapKey: 'M1',
      activeChannel: 1,
      visibility: 'open',
      now: 1_000,
    });
    const claims = upsertSpawnClaim([], {
      id: 'claim-1',
      partyId: party.id,
      mapKey: 'M1',
      channel: 1,
      timerKey: 'timer-1',
      entityName: 'Lykos',
      kind: 'boss',
      location: { x: 30, y: 40 },
      claimedAt: 1_000,
      claimedBy: 'Mateusz',
    });
    expect(claimsForPartyScope(claims, party, 'M1', 1)).toHaveLength(1);
    expect(claimsForPartyScope(claims, party, 'M1', 2)).toHaveLength(0);
  });
});
