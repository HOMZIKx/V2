import { describe, expect, it } from 'vitest';
import {
  PARTY_SCOUT_PIN_TTL_MS,
  activeScoutPins,
  createMapParty,
  dismissScoutPin,
  incrementSessionKills,
  isScoutPinActive,
  placeScoutPin,
  requestPartyJoin,
  resolvePartyRequest,
  scoutPinAgeMinutes,
  setPartyMap,
} from './map-party';

describe('map party hunt session', () => {
  const leader = { id: 'mateusz', displayName: 'Mateusz' };

  it('tworzy party na wybranej mapie z liderem i licznikiem zbić', () => {
    const party = createMapParty({
      leader,
      mapKey: 'M1',
      activeChannel: 3,
      visibility: 'closed',
      now: 1_000,
    });
    expect(party.members).toHaveLength(1);
    expect(party.sessionKills).toBe(0);
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

  it('trzyma pinezkę skauta ~10 min, potem znika; age w minutach', () => {
    const party = createMapParty({
      leader,
      mapKey: 'M1',
      activeChannel: 1,
      visibility: 'open',
      now: 0,
    });
    const pin = {
      id: 'pin-1',
      partyId: party.id,
      mapKey: 'M1',
      channel: 1,
      location: { x: 30, y: 40 },
      placedAt: 0,
      placedBy: 'Wicek',
      label: 'Metin',
      kind: 'metin' as const,
    };
    const pins = placeScoutPin([], pin);
    expect(isScoutPinActive(pin, 5 * 60_000)).toBe(true);
    expect(scoutPinAgeMinutes(pin, 5 * 60_000)).toBe(5);
    expect(activeScoutPins(pins, party, 'M1', 1, 5 * 60_000)).toHaveLength(1);
    expect(isScoutPinActive(pin, PARTY_SCOUT_PIN_TTL_MS)).toBe(false);
    expect(activeScoutPins(pins, party, 'M1', 1, PARTY_SCOUT_PIN_TTL_MS)).toHaveLength(0);
    expect(dismissScoutPin(pins, 'pin-1')).toHaveLength(0);
  });

  it('liczy zbicia w sesji party osobno od SpawnTimerów', () => {
    const party = createMapParty({
      leader,
      mapKey: 'M1',
      activeChannel: 1,
      visibility: 'open',
      now: 0,
    });
    expect(incrementSessionKills(party).sessionKills).toBe(1);
    expect(incrementSessionKills(party, 3).sessionKills).toBe(3);
  });
});
