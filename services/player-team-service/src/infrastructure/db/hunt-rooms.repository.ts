import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';

import { createLogger } from '@v2/observability';

import { PlayerTeamError } from '../../domain/errors.js';
import {
  type ConfirmTimerKillInput,
  type CreatePartyRoomInput,
  type HuntRoomsRepositoryPort,
  type JoinPartyRoomInput,
  type PartyRoomMember,
  type PartyRoomPin,
  type PartyRoomRecord,
  type PartyRoomRequest,
  type PatchPartyRoomInput,
  type TimerRoomRecord,
  type TimerRoomSnapshot,
} from '../../domain/ports/hunt-rooms.port.js';
import { type PlayerTeamEnv } from '../config/player-team-env.js';
import { PLAYER_TEAM_ENV } from '../../interface/player-team.tokens.js';

function newId(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString('hex')}`;
}

function joinCodeFromNow(): string {
  return String((Date.now() % 9000) + 1000);
}

@Injectable()
export class HuntRoomsRepository implements HuntRoomsRepositoryPort, OnModuleInit {
  private readonly logger = createLogger('hunt-rooms-repository');
  private pool: Pool | null = null;

  public constructor(@Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv) {}

  public onModuleInit(): void {
    this.pool = new Pool({
      connectionString: this.env.PLAYER_TEAM_DATABASE_URL,
      max: 10,
    });
    this.logger.info('hunt-rooms database pool created.');
  }

  private get db(): Pool {
    if (this.pool === null) throw new Error('hunt-rooms pool not initialized');
    return this.pool;
  }

  private mapPartyRow(row: {
    id: string;
    join_code: string;
    name: string;
    leader_id: string;
    visibility: 'open' | 'closed';
    map_key: string;
    active_channel: number;
    session_kills: number;
    members: PartyRoomMember[];
    requests: PartyRoomRequest[];
    pins: PartyRoomPin[];
    revision: number;
    updated_at: string | Date;
  }): PartyRoomRecord {
    return {
      id: row.id,
      joinCode: row.join_code,
      name: row.name,
      leaderId: row.leader_id,
      visibility: row.visibility,
      mapKey: row.map_key,
      activeChannel: Number(row.active_channel),
      sessionKills: Number(row.session_kills),
      members: Array.isArray(row.members) ? row.members : [],
      requests: Array.isArray(row.requests) ? row.requests : [],
      pins: Array.isArray(row.pins) ? row.pins : [],
      revision: Number(row.revision),
      updatedAtIso: new Date(row.updated_at).toISOString(),
    };
  }

  private mapTimerRow(row: {
    id: string;
    map_key: string;
    channel: number;
    room_code: string | null;
    timers: Record<string, TimerRoomRecord>;
    applied_ops: string[];
    revision: number;
    updated_at: string | Date;
  }): TimerRoomSnapshot {
    return {
      id: row.id,
      mapKey: row.map_key,
      channel: Number(row.channel),
      roomCode: row.room_code,
      timers: row.timers && typeof row.timers === 'object' ? row.timers : {},
      appliedOps: Array.isArray(row.applied_ops) ? row.applied_ops : [],
      revision: Number(row.revision),
      updatedAtIso: new Date(row.updated_at).toISOString(),
    };
  }

  public async createPartyRoom(input: CreatePartyRoomInput): Promise<PartyRoomRecord> {
    const id = newId('party');
    const code = joinCodeFromNow();
    const members: PartyRoomMember[] = [
      { id: input.leaderId, displayName: input.displayName, role: 'leader' },
    ];
    const result = await this.db.query({
      text: `INSERT INTO player_team_party_rooms
        (id, join_code, name, leader_id, visibility, map_key, active_channel, session_kills, members, requests, pins, revision, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8::jsonb, '[]'::jsonb, '[]'::jsonb, 0, NOW())
       RETURNING *`,
      values: [
        id,
        code,
        `Party · ${input.mapKey}`,
        input.leaderId,
        input.visibility,
        input.mapKey,
        input.activeChannel,
        JSON.stringify(members),
      ],
    });
    return this.mapPartyRow(result.rows[0]);
  }

  public async joinPartyRoom(input: JoinPartyRoomInput): Promise<PartyRoomRecord> {
    const code = input.joinCode.trim();
    const found = await this.db.query(`SELECT * FROM player_team_party_rooms WHERE join_code = $1`, [
      code,
    ]);
    const row = found.rows[0];
    if (row === undefined) {
      throw new PlayerTeamError('NOT_FOUND', 'party room not found for join code');
    }

    const members = (Array.isArray(row.members) ? row.members : []) as PartyRoomMember[];
    if (members.some((m) => m.id === input.viewerId)) {
      return this.mapPartyRow(row);
    }

    const nextMembers = [
      ...members,
      { id: input.viewerId, displayName: input.displayName, role: 'member' as const },
    ];

    const updated = await this.db.query(
      `UPDATE player_team_party_rooms
       SET members = $2::jsonb,
           revision = revision + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [row.id, JSON.stringify(nextMembers)],
    );
    return this.mapPartyRow(updated.rows[0]);
  }

  public async getPartyRoom(roomId: string): Promise<PartyRoomRecord | null> {
    const result = await this.db.query(`SELECT * FROM player_team_party_rooms WHERE id = $1`, [
      roomId,
    ]);
    const row = result.rows[0];
    return row === undefined ? null : this.mapPartyRow(row);
  }

  public async leavePartyRoom(roomId: string, viewerId: string): Promise<PartyRoomRecord | null> {
    const current = await this.getPartyRoom(roomId);
    if (current === null) return null;

    const nextMembers = current.members.filter((m) => m.id !== viewerId);
    if (nextMembers.length === 0) {
      await this.db.query(`DELETE FROM player_team_party_rooms WHERE id = $1`, [roomId]);
      return null;
    }

    let leaderId = current.leaderId;
    if (viewerId === current.leaderId) {
      leaderId = nextMembers[0]!.id;
      nextMembers[0] = { ...nextMembers[0]!, role: 'leader' };
    }

    const updated = await this.db.query(
      `UPDATE player_team_party_rooms
       SET members = $2::jsonb,
           leader_id = $3,
           revision = revision + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [roomId, JSON.stringify(nextMembers), leaderId],
    );
    return this.mapPartyRow(updated.rows[0]);
  }

  public async patchPartyRoom(input: PatchPartyRoomInput): Promise<PartyRoomRecord> {
    const current = await this.getPartyRoom(input.roomId);
    if (current === null) {
      throw new PlayerTeamError('NOT_FOUND', 'party room not found');
    }
    if (current.revision !== input.expectedRevision) {
      throw new PlayerTeamError(
        'REVISION_CONFLICT',
        `party room revision mismatch: expected ${input.expectedRevision}, actual ${current.revision}`,
        { actualRevision: current.revision },
      );
    }
    if (!current.members.some((m) => m.id === input.viewerId)) {
      throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not a party member');
    }

    const updated = await this.db.query(
      `UPDATE player_team_party_rooms
       SET map_key = COALESCE($2, map_key),
           active_channel = COALESCE($3, active_channel),
           session_kills = COALESCE($4, session_kills),
           visibility = COALESCE($5, visibility),
           revision = revision + 1,
           updated_at = NOW()
       WHERE id = $1 AND revision = $6
       RETURNING *`,
      [
        input.roomId,
        input.mapKey ?? null,
        input.activeChannel ?? null,
        input.sessionKills ?? null,
        input.visibility ?? null,
        input.expectedRevision,
      ],
    );
    if ((updated.rowCount ?? 0) === 0) {
      const again = await this.getPartyRoom(input.roomId);
      throw new PlayerTeamError(
        'REVISION_CONFLICT',
        'party room revision conflict on update',
        { actualRevision: again?.revision ?? null },
      );
    }
    return this.mapPartyRow(updated.rows[0]);
  }

  public async addPartyRoomPin(roomId: string, pin: PartyRoomPin): Promise<PartyRoomRecord> {
    const current = await this.getPartyRoom(roomId);
    if (current === null) {
      throw new PlayerTeamError('NOT_FOUND', 'party room not found');
    }
    const pins = [...current.pins.filter((p) => p.id !== pin.id), { ...pin, partyId: roomId }];
    const updated = await this.db.query(
      `UPDATE player_team_party_rooms
       SET pins = $2::jsonb,
           revision = revision + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [roomId, JSON.stringify(pins)],
    );
    return this.mapPartyRow(updated.rows[0]);
  }

  public async removePartyRoomPin(roomId: string, pinId: string): Promise<PartyRoomRecord> {
    const current = await this.getPartyRoom(roomId);
    if (current === null) {
      throw new PlayerTeamError('NOT_FOUND', 'party room not found');
    }
    const pins = current.pins.filter((p) => p.id !== pinId);
    const updated = await this.db.query(
      `UPDATE player_team_party_rooms
       SET pins = $2::jsonb,
           revision = revision + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [roomId, JSON.stringify(pins)],
    );
    return this.mapPartyRow(updated.rows[0]);
  }

  private timerRoomId(mapKey: string, channel: number, roomCode: string | null): string {
    const code = roomCode && roomCode.trim().length > 0 ? roomCode.trim() : '_';
    return `timer-${mapKey}-ch${channel}-${code}`;
  }

  public async getOrCreateTimerRoom(
    mapKey: string,
    channel: number,
    roomCode: string | null,
  ): Promise<TimerRoomSnapshot> {
    const normalizedCode =
      roomCode && roomCode.trim().length > 0 ? roomCode.trim() : null;
    const id = this.timerRoomId(mapKey, channel, normalizedCode);

    const existing = await this.db.query(`SELECT * FROM player_team_timer_rooms WHERE id = $1`, [
      id,
    ]);
    if (existing.rows[0] !== undefined) {
      return this.mapTimerRow(existing.rows[0]);
    }

    const inserted = await this.db.query(
      `INSERT INTO player_team_timer_rooms
        (id, map_key, channel, room_code, timers, applied_ops, revision, updated_at)
       VALUES ($1, $2, $3, $4, '{}'::jsonb, '[]'::jsonb, 0, NOW())
       ON CONFLICT (id) DO UPDATE SET updated_at = player_team_timer_rooms.updated_at
       RETURNING *`,
      [id, mapKey, channel, normalizedCode],
    );
    return this.mapTimerRow(inserted.rows[0]);
  }

  public async confirmTimerKill(input: ConfirmTimerKillInput): Promise<TimerRoomSnapshot> {
    const room = await this.getOrCreateTimerRoom(input.mapKey, input.channel, input.roomCode);

    if (input.expectedRevision !== null && room.revision !== input.expectedRevision) {
      // Soft conflict: still return current if op already applied; otherwise conflict.
      if (room.appliedOps.includes(input.operationId)) {
        return room;
      }
      throw new PlayerTeamError(
        'REVISION_CONFLICT',
        `timer room revision mismatch: expected ${input.expectedRevision}, actual ${room.revision}`,
        { actualRevision: room.revision },
      );
    }

    if (room.appliedOps.includes(input.operationId)) {
      return room;
    }

    const timers: Record<string, TimerRoomRecord> = {
      ...room.timers,
      [input.record.key]: { ...input.record, operationId: input.operationId },
    };
    const appliedOps = [...room.appliedOps, input.operationId].slice(-500);

    const updated = await this.db.query(
      `UPDATE player_team_timer_rooms
       SET timers = $2::jsonb,
           applied_ops = $3::jsonb,
           revision = revision + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [room.id, JSON.stringify(timers), JSON.stringify(appliedOps)],
    );
    return this.mapTimerRow(updated.rows[0]);
  }
}
