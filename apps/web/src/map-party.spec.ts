import { describe, expect, it } from 'vitest';
import {
  PARTY_SCOUT_PIN_TTL_MS,
  activeScoutPins,
  createMapParty,
  dismissScoutPin,
  formatScoutPinRemaining,
  incrementSessionKills,
  isScoutPinActive,
  joinPartyByCode,
  partyActiveScoutPins,
  placeScoutPin,
  pruneExpiredScoutPins,
  requestPartyJoin,
  resetSessionKills,
  resolvePartyRequest,
  scoutPinAgeMinutes,
  scoutPinKindLabel,
  setPartyMap,
} from './map-party';

describe('map party hunt session', () => {
  const leader = { id: 'mateusz', displayName: 'Mateusz' };

  it('tworzy party na wybranej mapie z liderem i licznikiem zbić', () => {
    const party = createMapParty({
      leader,
      mapKey: 'M2',
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
      mapKey: 'M2',
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

  it('dołącza lokalnie po dokładnym kodzie zapisanego zamkniętego party', () => {
    const closed = createMapParty({
      leader,
      mapKey: 'M2',
      activeChannel: 2,
      visibility: 'closed',
      now: 5_000,
    });
    const ok = joinPartyByCode({
      code: closed.joinCode,
      savedClosedParty: closed,
      member: leader,
      mapKey: 'M2',
      activeChannel: 1,
      now: 9_000,
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.fromSaved).toBe(true);
    expect(ok.party.id).toBe(closed.id);
    expect(ok.party.activeChannel).toBe(2);

    const bad = joinPartyByCode({
      code: '9999',
      savedClosedParty: closed,
      member: leader,
      mapKey: 'M2',
      activeChannel: 1,
      now: 9_000,
    });
    expect(bad).toEqual({ ok: false, error: 'Niepoprawny kod party.' });
  });

  it('bez zapisanego party tworzy mock dołączenia z dowolnym niepustym kodem', () => {
    const empty = joinPartyByCode({
      code: '   ',
      savedClosedParty: null,
      member: leader,
      mapKey: 'M2',
      activeChannel: 1,
      now: 1,
    });
    expect(empty).toEqual({ ok: false, error: 'Podaj kod party.' });

    const mock = joinPartyByCode({
      code: '4242',
      savedClosedParty: null,
      member: leader,
      mapKey: 'M2',
      activeChannel: 3,
      now: 42,
    });
    expect(mock.ok).toBe(true);
    if (!mock.ok) return;
    expect(mock.fromSaved).toBe(false);
    expect(mock.party.joinCode).toBe('4242');
    expect(mock.party.members.map((m) => m.role)).toEqual(['leader', 'member']);
  });

  it('trzyma pinezkę skauta ~10 min, potem znika; age w minutach', () => {
    const party = createMapParty({
      leader,
      mapKey: 'M2',
      activeChannel: 1,
      visibility: 'open',
      now: 0,
    });
    const pin = {
      id: 'pin-1',
      partyId: party.id,
      mapKey: 'M2',
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
    expect(activeScoutPins(pins, party, 'M2', 1, 5 * 60_000)).toHaveLength(1);
    expect(partyActiveScoutPins(pins, party, 5 * 60_000)).toHaveLength(1);
    expect(isScoutPinActive(pin, PARTY_SCOUT_PIN_TTL_MS)).toBe(false);
    expect(activeScoutPins(pins, party, 'M2', 1, PARTY_SCOUT_PIN_TTL_MS)).toHaveLength(0);
    expect(dismissScoutPin(pins, 'pin-1')).toHaveLength(0);
    expect(scoutPinKindLabel('boss')).toBe('Boss');
    expect(formatScoutPinRemaining(65_000)).toBe('1:05');
    expect(formatScoutPinRemaining(0)).toBe('0:00');
  });

  it('liczy zbicia w sesji party osobno od SpawnTimerów i pozwala reset', () => {
    const party = createMapParty({
      leader,
      mapKey: 'M2',
      activeChannel: 1,
      visibility: 'open',
      now: 0,
    });
    expect(incrementSessionKills(party).sessionKills).toBe(1);
    expect(incrementSessionKills(party, 3).sessionKills).toBe(3);
    expect(resetSessionKills(incrementSessionKills(party, 3)).sessionKills).toBe(0);
  });

  it('czyści wygasłe pinezki skauta z magazynu lokalnego', () => {
    const pin = {
      id: 'pin-old',
      partyId: 'party-1',
      mapKey: 'M2',
      channel: 1,
      location: { x: 10, y: 20 },
      placedAt: 0,
      placedBy: 'Wicek',
      label: 'Metin',
      kind: 'metin' as const,
    };
    expect(pruneExpiredScoutPins([pin], 5 * 60_000)).toHaveLength(1);
    expect(pruneExpiredScoutPins([pin], PARTY_SCOUT_PIN_TTL_MS)).toHaveLength(0);
  });
});
