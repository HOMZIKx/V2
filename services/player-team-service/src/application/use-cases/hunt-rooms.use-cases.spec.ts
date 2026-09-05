import { describe, expect, it } from 'vitest';

import { PlayerTeamError } from '../../domain/errors.js';
import type {
  ConfirmTimerKillInput,
  CreatePartyRoomInput,
  HuntRoomsRepositoryPort,
  JoinPartyRoomInput,
  PartyRoomMember,
  PartyRoomPin,
  PartyRoomRecord,
  PatchPartyRoomInput,
  TimerRoomRecord,
  TimerRoomSnapshot,
} from '../../domain/ports/hunt-rooms.port.js';
import { HuntRoomsUseCases } from './hunt-rooms.use-cases.js';

class MemoryHuntRoomsRepo implements HuntRoomsRepositoryPort {
  private parties = new Map<string, PartyRoomRecord>();
  private timers = new Map<string, TimerRoomSnapshot>();
  private joinIndex = new Map<string, string>();

  private timerId(mapKey: string, channel: number, roomCode: string | null): string {
    const code = roomCode && roomCode.trim().length > 0 ? roomCode.trim() : '_';
    return `timer-${mapKey}-ch${channel}-${code}`;
  }

  public async createPartyRoom(input: CreatePartyRoomInput): Promise<PartyRoomRecord> {
    const id = `party-${this.parties.size + 1}`;
    const joinCode = String(1000 + this.parties.size);
    const members: PartyRoomMember[] = [
      { id: input.leaderId, displayName: input.displayName, role: 'leader' },
    ];
    const room: PartyRoomRecord = {
      id,
      joinCode,
      name: `Party · ${input.mapKey}`,
      leaderId: input.leaderId,
      visibility: input.visibility,
      mapKey: input.mapKey,
      activeChannel: input.activeChannel,
      sessionKills: 0,
      members,
      requests: [],
      pins: [],
      revision: 0,
      updatedAtIso: new Date().toISOString(),
    };
    this.parties.set(id, room);
    this.joinIndex.set(joinCode, id);
    return room;
  }

  public async joinPartyRoom(input: JoinPartyRoomInput): Promise<PartyRoomRecord> {
    const roomId = this.joinIndex.get(input.joinCode.trim());
    if (roomId === undefined) {
      throw new PlayerTeamError('NOT_FOUND', 'party room not found for join code');
    }
    const current = this.parties.get(roomId)!;
    if (current.members.some((m) => m.id === input.viewerId)) return current;
    const next: PartyRoomRecord = {
      ...current,
      members: [
        ...current.members,
        { id: input.viewerId, displayName: input.displayName, role: 'member' },
      ],
      revision: current.revision + 1,
      updatedAtIso: new Date().toISOString(),
    };
    this.parties.set(roomId, next);
    return next;
  }

  public async getPartyRoom(roomId: string): Promise<PartyRoomRecord | null> {
    return this.parties.get(roomId) ?? null;
  }

  public async leavePartyRoom(roomId: string, viewerId: string): Promise<PartyRoomRecord | null> {
    const current = this.parties.get(roomId);
    if (!current) return null;
    const nextMembers = current.members.filter((m) => m.id !== viewerId);
    if (nextMembers.length === 0) {
      this.parties.delete(roomId);
      this.joinIndex.delete(current.joinCode);
      return null;
    }
    let leaderId = current.leaderId;
    if (viewerId === current.leaderId) {
      leaderId = nextMembers[0]!.id;
      nextMembers[0] = { ...nextMembers[0]!, role: 'leader' };
    }
    const next: PartyRoomRecord = {
      ...current,
      members: nextMembers,
      leaderId,
      revision: current.revision + 1,
      updatedAtIso: new Date().toISOString(),
    };
    this.parties.set(roomId, next);
    return next;
  }

  public async patchPartyRoom(input: PatchPartyRoomInput): Promise<PartyRoomRecord> {
    const current = this.parties.get(input.roomId);
    if (!current) throw new PlayerTeamError('NOT_FOUND', 'party room not found');
    if (current.revision !== input.expectedRevision) {
      throw new PlayerTeamError('REVISION_CONFLICT', 'revision mismatch', {
        actualRevision: current.revision,
      });
    }
    const next: PartyRoomRecord = {
      ...current,
      mapKey: input.mapKey ?? current.mapKey,
      activeChannel: input.activeChannel ?? current.activeChannel,
      sessionKills: input.sessionKills ?? current.sessionKills,
      visibility: input.visibility ?? current.visibility,
      revision: current.revision + 1,
      updatedAtIso: new Date().toISOString(),
    };
    this.parties.set(input.roomId, next);
    return next;
  }

  public async addPartyRoomPin(roomId: string, pin: PartyRoomPin): Promise<PartyRoomRecord> {
    const current = this.parties.get(roomId);
    if (!current) throw new PlayerTeamError('NOT_FOUND', 'party room not found');
    const pins = [...current.pins.filter((p) => p.id !== pin.id), { ...pin, partyId: roomId }];
    const next: PartyRoomRecord = {
      ...current,
      pins,
      revision: current.revision + 1,
      updatedAtIso: new Date().toISOString(),
    };
    this.parties.set(roomId, next);
    return next;
  }

  public async removePartyRoomPin(roomId: string, pinId: string): Promise<PartyRoomRecord> {
    const current = this.parties.get(roomId);
    if (!current) throw new PlayerTeamError('NOT_FOUND', 'party room not found');
    const next: PartyRoomRecord = {
      ...current,
      pins: current.pins.filter((p) => p.id !== pinId),
      revision: current.revision + 1,
      updatedAtIso: new Date().toISOString(),
    };
    this.parties.set(roomId, next);
    return next;
  }

  public async getOrCreateTimerRoom(
    mapKey: string,
    channel: number,
    roomCode: string | null,
  ): Promise<TimerRoomSnapshot> {
    const id = this.timerId(mapKey, channel, roomCode);
    const existing = this.timers.get(id);
    if (existing) return existing;
    const created: TimerRoomSnapshot = {
      id,
      mapKey,
      channel,
      roomCode: roomCode && roomCode.trim().length > 0 ? roomCode.trim() : null,
      timers: {},
      appliedOps: [],
      revision: 0,
      updatedAtIso: new Date().toISOString(),
    };
    this.timers.set(id, created);
    return created;
  }

  public async confirmTimerKill(input: ConfirmTimerKillInput): Promise<TimerRoomSnapshot> {
    const room = await this.getOrCreateTimerRoom(input.mapKey, input.channel, input.roomCode);
    if (room.appliedOps.includes(input.operationId)) return room;
    if (input.expectedRevision !== null && room.revision !== input.expectedRevision) {
      throw new PlayerTeamError('REVISION_CONFLICT', 'revision mismatch', {
        actualRevision: room.revision,
      });
    }
    const timers: Record<string, TimerRoomRecord> = {
      ...room.timers,
      [input.record.key]: { ...input.record, operationId: input.operationId },
    };
    const next: TimerRoomSnapshot = {
      ...room,
      timers,
      appliedOps: [...room.appliedOps, input.operationId],
      revision: room.revision + 1,
      updatedAtIso: new Date().toISOString(),
    };
    this.timers.set(room.id, next);
    return next;
  }
}

describe('HuntRoomsUseCases', () => {
  it('assertDemoAccess wymaga nagłówka i flagi allowDemoWrite', () => {
    const denied = new HuntRoomsUseCases(new MemoryHuntRoomsRepo(), { allowDemoWrite: false });
    expect(() => denied.assertDemoAccess('v1')).toThrow(PlayerTeamError);
    const allowed = new HuntRoomsUseCases(new MemoryHuntRoomsRepo(), { allowDemoWrite: true });
    expect(() => allowed.assertDemoAccess(undefined)).toThrow(PlayerTeamError);
    expect(allowed.assertDemoAccess('  mateusz  ')).toBe('mateusz');
  });

  it('tworzy party, dołącza drugiego gracza i dodaje pin', async () => {
    const useCases = new HuntRoomsUseCases(new MemoryHuntRoomsRepo(), { allowDemoWrite: true });
    const room = await useCases.createPartyRoom({
      leaderId: 'm1',
      displayName: 'Mateusz',
      mapKey: 'Yongbi',
      activeChannel: 2,
      visibility: 'closed',
    });
    expect(room.members).toHaveLength(1);
    expect(room.leaderId).toBe('m1');

    const joined = await useCases.joinPartyRoom({
      viewerId: 'w1',
      displayName: 'Wicek',
      joinCode: room.joinCode,
    });
    expect(joined.members.map((m) => m.id)).toEqual(['m1', 'w1']);

    const withPin = await useCases.addPartyRoomPin(room.id, {
      id: 'pin-1',
      partyId: room.id,
      mapKey: 'Yongbi',
      channel: 2,
      location: { x: 1, y: 2 },
      placedAt: 100,
      placedBy: 'Mateusz',
      label: 'Metin',
      kind: 'metin',
    });
    expect(withPin.pins).toHaveLength(1);
    expect(withPin.revision).toBeGreaterThan(joined.revision);
  });

  it('confirmTimerKill jest idempotentny po operationId', async () => {
    const useCases = new HuntRoomsUseCases(new MemoryHuntRoomsRepo(), { allowDemoWrite: true });
    const record: TimerRoomRecord = {
      key: 'Yongbi:ch1:metin:1',
      mapKey: 'Yongbi',
      channel: 1,
      kind: 'metin',
      entityName: 'Metin',
      confirmedAt: 1000,
      confirmedBy: 'Mateusz',
      location: { x: 10, y: 20 },
    };
    const first = await useCases.confirmTimerKill({
      mapKey: 'Yongbi',
      channel: 1,
      roomCode: null,
      record,
      operationId: 'op-1',
      expectedRevision: null,
    });
    expect(first.revision).toBe(1);
    expect(first.timers[record.key]?.confirmedAt).toBe(1000);
    expect(first.appliedOps).toContain('op-1');

    const dup = await useCases.confirmTimerKill({
      mapKey: 'Yongbi',
      channel: 1,
      roomCode: null,
      record: { ...record, confirmedAt: 9999, confirmedBy: 'Other' },
      operationId: 'op-1',
      expectedRevision: null,
    });
    expect(dup.revision).toBe(1);
    expect(dup.timers[record.key]?.confirmedAt).toBe(1000);
    expect(dup.appliedOps.filter((id) => id === 'op-1')).toHaveLength(1);
  });

  it('getOrCreateTimerRoom zwraca ten sam pokój przy powtórzeniu', async () => {
    const useCases = new HuntRoomsUseCases(new MemoryHuntRoomsRepo(), { allowDemoWrite: true });
    const a = await useCases.getOrCreateTimerRoom('M2', 3, null);
    const b = await useCases.getOrCreateTimerRoom('M2', 3, null);
    expect(a.id).toBe(b.id);
    expect(a.revision).toBe(0);
  });
});
