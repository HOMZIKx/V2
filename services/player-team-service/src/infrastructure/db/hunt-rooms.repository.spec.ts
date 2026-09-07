import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlayerTeamError } from '../../domain/errors.js';
import type { PartyRoomPin, TimerRoomRecord } from '../../domain/ports/hunt-rooms.port.js';
import { parsePlayerTeamEnv } from '../config/player-team-env.js';
import { HuntRoomsRepository } from './hunt-rooms.repository.js';

const env = parsePlayerTeamEnv({
  NODE_ENV: 'test',
  PLAYER_TEAM_DATABASE_URL: 'postgres://test:test@localhost:5432/test',
});

function partyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'party-1',
    join_code: '1234',
    name: 'Party · M2',
    leader_id: 'u1',
    visibility: 'closed',
    map_key: 'M2',
    active_channel: 1,
    session_kills: 2,
    members: [{ id: 'u1', displayName: 'Mateusz', role: 'leader' }],
    requests: [],
    pins: [],
    revision: 1,
    updated_at: '2026-09-07T12:00:00.000Z',
    ...overrides,
  };
}

function timerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'timer-M2-ch1-_',
    map_key: 'M2',
    channel: 1,
    room_code: null,
    timers: {},
    applied_ops: [],
    revision: 1,
    updated_at: '2026-09-07T12:00:00.000Z',
    ...overrides,
  };
}

function setup() {
  const query = vi.fn();
  const repository = new HuntRoomsRepository(env);
  Object.defineProperty(repository, 'pool', {
    configurable: true,
    value: { query },
  });
  return { query, repository };
}

describe('HuntRoomsRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates and maps a party room', async () => {
    const { query, repository } = setup();
    query.mockResolvedValueOnce({ rows: [partyRow()], rowCount: 1 });

    const room = await repository.createPartyRoom({
      leaderId: 'u1',
      displayName: 'Mateusz',
      mapKey: 'M2',
      activeChannel: 1,
      visibility: 'closed',
    });

    expect(room).toMatchObject({
      id: 'party-1',
      joinCode: '1234',
      leaderId: 'u1',
      mapKey: 'M2',
      activeChannel: 1,
      sessionKills: 2,
      revision: 1,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('joins an existing room and preserves an already-present member', async () => {
    const { query, repository } = setup();
    query.mockResolvedValueOnce({ rows: [partyRow()], rowCount: 1 });

    const room = await repository.joinPartyRoom({
      joinCode: ' 1234 ',
      viewerId: 'u1',
      displayName: 'Mateusz',
    });

    expect(room.members).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('adds a new member when joining by code', async () => {
    const { query, repository } = setup();
    query.mockResolvedValueOnce({ rows: [partyRow()], rowCount: 1 }).mockResolvedValueOnce({
      rows: [
        partyRow({
          members: [
            { id: 'u1', displayName: 'Mateusz', role: 'leader' },
            { id: 'u2', displayName: 'Kolega', role: 'member' },
          ],
          revision: 2,
        }),
      ],
      rowCount: 1,
    });

    const room = await repository.joinPartyRoom({
      joinCode: '1234',
      viewerId: 'u2',
      displayName: 'Kolega',
    });

    expect(room.members.map((member) => member.id)).toEqual(['u1', 'u2']);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects an unknown join code', async () => {
    const { query, repository } = setup();
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      repository.joinPartyRoom({ joinCode: '9999', viewerId: 'u2', displayName: 'Kolega' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns a party room or null by id', async () => {
    const { query, repository } = setup();
    query
      .mockResolvedValueOnce({ rows: [partyRow()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(repository.getPartyRoom('party-1')).resolves.toMatchObject({ id: 'party-1' });
    await expect(repository.getPartyRoom('missing')).resolves.toBeNull();
  });

  it('deletes a room when its last member leaves', async () => {
    const { query, repository } = setup();
    query
      .mockResolvedValueOnce({ rows: [partyRow()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(repository.leavePartyRoom('party-1', 'u1')).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('reassigns leadership when the leader leaves', async () => {
    const { query, repository } = setup();
    const members = [
      { id: 'u1', displayName: 'Mateusz', role: 'leader' },
      { id: 'u2', displayName: 'Kolega', role: 'member' },
    ];
    query
      .mockResolvedValueOnce({ rows: [partyRow({ members })], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          partyRow({
            leader_id: 'u2',
            members: [{ id: 'u2', displayName: 'Kolega', role: 'leader' }],
            revision: 2,
          }),
        ],
        rowCount: 1,
      });

    const room = await repository.leavePartyRoom('party-1', 'u1');
    expect(room).toMatchObject({ leaderId: 'u2' });
    expect(room?.members[0]?.role).toBe('leader');
  });

  it('validates patch authorization and revision before updating', async () => {
    const missing = setup();
    missing.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(
      missing.repository.patchPartyRoom({
        roomId: 'missing',
        viewerId: 'u1',
        expectedRevision: 1,
        mapKey: 'M3',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const conflict = setup();
    conflict.query.mockResolvedValueOnce({ rows: [partyRow({ revision: 3 })], rowCount: 1 });
    await expect(
      conflict.repository.patchPartyRoom({
        roomId: 'party-1',
        viewerId: 'u1',
        expectedRevision: 2,
        mapKey: 'M3',
      }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT', actualRevision: 3 });

    const unauthorized = setup();
    unauthorized.query.mockResolvedValueOnce({ rows: [partyRow()], rowCount: 1 });
    await expect(
      unauthorized.repository.patchPartyRoom({
        roomId: 'party-1',
        viewerId: 'other',
        expectedRevision: 1,
        mapKey: 'M3',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('patches a party room and reports an update-time revision conflict', async () => {
    const success = setup();
    success.query
      .mockResolvedValueOnce({ rows: [partyRow()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [partyRow({ map_key: 'M3', revision: 2 })], rowCount: 1 });
    await expect(
      success.repository.patchPartyRoom({
        roomId: 'party-1',
        viewerId: 'u1',
        expectedRevision: 1,
        mapKey: 'M3',
        activeChannel: 2,
        sessionKills: 4,
        visibility: 'open',
      }),
    ).resolves.toMatchObject({ mapKey: 'M3', revision: 2 });

    const conflict = setup();
    conflict.query
      .mockResolvedValueOnce({ rows: [partyRow()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [partyRow({ revision: 2 })], rowCount: 1 });
    await expect(
      conflict.repository.patchPartyRoom({
        roomId: 'party-1',
        viewerId: 'u1',
        expectedRevision: 1,
        mapKey: 'M3',
      }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT', actualRevision: 2 });
  });

  it('adds and removes shared pins', async () => {
    const pin: PartyRoomPin = {
      id: 'pin-1',
      partyId: 'party-1',
      mapKey: 'M2',
      channel: 1,
      kind: 'metin',
      location: { x: 12, y: 34 },
      label: 'Metin',
      placedAt: 1_788_000_000_000,
      placedBy: 'Mateusz',
    };

    const add = setup();
    add.query
      .mockResolvedValueOnce({ rows: [partyRow()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [partyRow({ pins: [pin], revision: 2 })], rowCount: 1 });
    await expect(add.repository.addPartyRoomPin('party-1', pin)).resolves.toMatchObject({
      pins: [pin],
    });

    const remove = setup();
    remove.query
      .mockResolvedValueOnce({ rows: [partyRow({ pins: [pin] })], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [partyRow({ pins: [], revision: 2 })], rowCount: 1 });
    await expect(remove.repository.removePartyRoomPin('party-1', 'pin-1')).resolves.toMatchObject({
      pins: [],
    });
  });

  it('gets an existing timer room or creates a new one', async () => {
    const existing = setup();
    existing.query.mockResolvedValueOnce({ rows: [timerRow()], rowCount: 1 });
    await expect(existing.repository.getOrCreateTimerRoom('M2', 1, null)).resolves.toMatchObject({
      id: 'timer-M2-ch1-_',
      mapKey: 'M2',
      channel: 1,
    });

    const created = setup();
    created.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [timerRow({ room_code: 'ABCD' })], rowCount: 1 });
    await expect(created.repository.getOrCreateTimerRoom('M2', 1, ' ABCD ')).resolves.toMatchObject(
      {
        roomCode: 'ABCD',
      },
    );
  });

  it('confirms timer kills idempotently and guards revision conflicts', async () => {
    const record: TimerRoomRecord = {
      key: 'metin-M2-ch1-1',
      mapKey: 'M2',
      channel: 1,
      kind: 'metin',
      entityName: 'Metin',
      confirmedAt: 1_788_000_000_000,
      confirmedBy: 'Mateusz',
      location: { x: 10, y: 20 },
    };

    const idempotent = setup();
    idempotent.query.mockResolvedValueOnce({
      rows: [timerRow({ applied_ops: ['op-1'] })],
      rowCount: 1,
    });
    await expect(
      idempotent.repository.confirmTimerKill({
        mapKey: 'M2',
        channel: 1,
        roomCode: null,
        operationId: 'op-1',
        expectedRevision: 1,
        record,
      }),
    ).resolves.toMatchObject({ appliedOps: ['op-1'] });

    const conflict = setup();
    conflict.query.mockResolvedValueOnce({ rows: [timerRow({ revision: 3 })], rowCount: 1 });
    await expect(
      conflict.repository.confirmTimerKill({
        mapKey: 'M2',
        channel: 1,
        roomCode: null,
        operationId: 'op-2',
        expectedRevision: 2,
        record,
      }),
    ).rejects.toBeInstanceOf(PlayerTeamError);

    const update = setup();
    update.query.mockResolvedValueOnce({ rows: [timerRow()], rowCount: 1 }).mockResolvedValueOnce({
      rows: [
        timerRow({
          revision: 2,
          applied_ops: ['op-3'],
          timers: { [record.key]: { ...record, operationId: 'op-3' } },
        }),
      ],
      rowCount: 1,
    });
    await expect(
      update.repository.confirmTimerKill({
        mapKey: 'M2',
        channel: 1,
        roomCode: null,
        operationId: 'op-3',
        expectedRevision: 1,
        record,
      }),
    ).resolves.toMatchObject({ revision: 2, appliedOps: ['op-3'] });
  });
});
