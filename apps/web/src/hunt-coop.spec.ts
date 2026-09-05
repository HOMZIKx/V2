import { describe, expect, it } from 'vitest';

import { PARTY_SCOUT_PIN_TTL_MS } from './map-party';
import {
  confirmKillInTimersRoom,
  createPartyRoom,
  emptyTimersRoom,
  generateJoinCode,
  joinPartyRoom,
  normalizeJoinCode,
  pinTtlExpired,
  prunePartyRoomPins,
  addPinToPartyRoom,
  partyRoomOwnerId,
  timersRoomOwnerId,
} from './hunt-coop';

describe('hunt coop room store', () => {
  it('confirmKill jest idempotentny dla tego samego idempotencyKey', () => {
    const room = emptyTimersRoom('M2', 1, 1_000, 'Mateusz');
    const first = confirmKillInTimersRoom(room, {
      timerId: 'metin-M2-ch1-a',
      confirmedAt: 2_000,
      confirmedBy: 'Mateusz',
      location: { x: 10, y: 20 },
      idempotencyKey: 'k1',
      updatedBy: 'Mateusz',
    });
    expect(first.applied).toBe(true);
    expect(first.room.timers['metin-M2-ch1-a']?.confirmedAt).toBe(2_000);

    const dup = confirmKillInTimersRoom(first.room, {
      timerId: 'metin-M2-ch1-a',
      confirmedAt: 9_000,
      confirmedBy: 'Mateusz',
      location: { x: 1, y: 1 },
      idempotencyKey: 'k1',
      updatedBy: 'Mateusz',
    });
    expect(dup.duplicate).toBe(true);
    expect(dup.applied).toBe(false);
    expect(dup.room.timers['metin-M2-ch1-a']?.confirmedAt).toBe(2_000);

    const next = confirmKillInTimersRoom(first.room, {
      timerId: 'metin-M2-ch1-a',
      confirmedAt: 5_000,
      confirmedBy: 'Wicek',
      location: null,
      idempotencyKey: 'k2',
      updatedBy: 'Wicek',
    });
    expect(next.applied).toBe(true);
    expect(next.room.timers['metin-M2-ch1-a']?.confirmedBy).toBe('Wicek');
  });

  it('tworzy i dołącza party po 6-znakowym kodzie', () => {
    const code = normalizeJoinCode(generateJoinCode(42_000, 7));
    expect(code).toHaveLength(6);
    const room = createPartyRoom({
      leader: { id: 'm1', displayName: 'Mateusz' },
      mapKey: 'M2',
      activeChannel: 2,
      visibility: 'closed',
      now: 42_000,
      joinCode: code,
    });
    expect(room.party.joinCode).toBe(code);
    expect(partyRoomOwnerId(code)).toBe(`coop-party:${code}`);
    expect(timersRoomOwnerId('M2', 3)).toBe('coop-timers:M2:ch3');

    const joined = joinPartyRoom(room, { id: 'w1', displayName: 'Wicek' }, 50_000);
    expect(joined.party.members.map((m) => m.id)).toEqual(['m1', 'w1']);
    const again = joinPartyRoom(joined, { id: 'w1', displayName: 'Wicek' }, 51_000);
    expect(again.party.members).toHaveLength(2);
  });

  it('usuwa wygasłe pinezki po TTL', () => {
    const room = createPartyRoom({
      leader: { id: 'm1', displayName: 'Mateusz' },
      mapKey: 'M2',
      activeChannel: 1,
      visibility: 'open',
      now: 1_000,
      joinCode: 'ABC123',
    });
    const withPin = addPinToPartyRoom(
      room,
      {
        id: 'pin-1',
        partyId: room.party.id,
        mapKey: 'M2',
        channel: 1,
        location: { x: 5, y: 5 },
        placedAt: 1_000,
        placedBy: 'Mateusz',
        label: 'Metin',
        kind: 'metin',
      },
      'Mateusz',
    );
    expect(pinTtlExpired(withPin.pins[0]!, 1_000 + PARTY_SCOUT_PIN_TTL_MS - 1)).toBe(false);
    expect(pinTtlExpired(withPin.pins[0]!, 1_000 + PARTY_SCOUT_PIN_TTL_MS)).toBe(true);
    const pruned = prunePartyRoomPins(withPin, 1_000 + PARTY_SCOUT_PIN_TTL_MS + 1);
    expect(pruned.pins).toHaveLength(0);
  });
});
