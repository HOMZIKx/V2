import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';

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
import { PLAYER_TEAM_ENV } from '../../interface/player-team.tokens.js';
import { type PlayerTeamEnv } from '../config/player-team-env.js';

function newId(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString('hex')}`;
}

function newPartyJoinCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === '23505'
  );
}

function isLeaderOnlyPatch(input: PatchPartyRoomInput): boolean {
  return (
    input.mapKey !== undefined ||
    input.activeChannel !== undefined ||
    input.sessionKills !== undefined ||
    input.visibility !== undefined ||
    input.requests !== undefined
  );
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
    const members: PartyRoomMember[] = [
      { id: input.leaderId, displayName: input.displayName, role: 'leader' },
    ];

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = newId('party');
      const code = newPartyJoinCode();
      try {
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
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === 4) throw error;
      }
    }

    throw new PlayerTeamError('VALIDATION_FAILED', 'could not allocate a unique party join code');
  }

  public async joinPartyRoom(input: JoinPartyRoomInput): Promise<PartyRoomRecord> {
    const code = input.joinCode.trim();
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT * FROM player_team_party_rooms WHERE join_code = $1 FOR UPDATE`,
        [code],
      );
      const row = found.rows[0];
      if (row === undefined) {
        throw new PlayerTeamError('NOT_FOUND', 'party room not found for join code');
      }

      const members = (Array.isArray(row.members) ? row.members : []) as PartyRoomMember[];
      if (members.some((member) => member.id === input.viewerId)) {
        await client.query('COMMIT');
        return this.mapPartyRow(row);
      }
      if (row.visibility !== 'open') {
        throw new PlayerTeamError('VALIDATION_FAILED', 'party room is closed');
      }

      const nextMembers = [
        ...members,
        { id: input.viewerId, displayName: input.displayName, role: 'member' as const },
      ];
      const updated = await client.query(
        `UPDATE player_team_party_rooms
         SET members = $2::jsonb,
             revision = revision + 1,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [row.id, JSON.stringify(nextMembers)],
      );
      await client.query('COMMIT');
      return this.mapPartyRow(updated.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async getPartyRoom(roomId: string): Promise<PartyRoomRecord | null> {
    const result = await this.db.query(`SELECT * FROM player_team_party_rooms WHERE id = $1`, [
      roomId,
    ]);
    const row = result.rows[0];
    return row === undefined ? null : this.mapPartyRow(row);
  }

  public async leavePartyRoom(roomId: string, viewerId: string): Promise<PartyRoomRecord | null> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT * FROM player_team_party_rooms WHERE id = $1 FOR UPDATE`,
        [roomId],
      );
      const row = found.rows[0];
      if (row === undefined) {
        await client.query('COMMIT');
        return null;
      }

      const current = this.mapPartyRow(row);
      if (!current.members.some((member) => member.id === viewerId)) {
        throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not a party member');
      }

      const nextMembers = current.members.filter((member) => member.id !== viewerId);
      if (nextMembers.length === 0) {
        await client.query(`DELETE FROM player_team_party_rooms WHERE id = $1`, [roomId]);
        await client.query('COMMIT');
        return null;
      }

      let leaderId = current.leaderId;
      if (viewerId === current.leaderId) {
        leaderId = nextMembers[0]!.id;
        nextMembers[0] = { ...nextMembers[0]!, role: 'leader' };
      }

      const updated = await client.query(
        `UPDATE player_team_party_rooms
         SET members = $2::jsonb,
             leader_id = $3,
             revision = revision + 1,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [roomId, JSON.stringify(nextMembers), leaderId],
      );
      await client.query('COMMIT');
      return this.mapPartyRow(updated.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async patchPartyRoom(input: PatchPartyRoomInput): Promise<PartyRoomRecord> {
    if (input.sessionKillsDelta !== undefined && input.sessionKillsDelta !== 1) {
      throw new PlayerTeamError('VALIDATION_FAILED', 'session kill delta must be exactly +1');
    }

    const leaderOnly = isLeaderOnlyPatch(input);
    const updated = await this.db.query(
      `UPDATE player_team_party_rooms
       SET map_key = COALESCE($2, map_key),
           active_channel = COALESCE($3, active_channel),
           session_kills = CASE
             WHEN $4::integer IS NOT NULL THEN $4::integer
             WHEN $5::integer IS NOT NULL THEN session_kills + $5::integer
             ELSE session_kills
           END,
           visibility = COALESCE($6, visibility),
           requests = COALESCE($7::jsonb, requests),
           revision = revision + 1,
           updated_at = NOW()
       WHERE id = $1
         AND revision = $8
         AND EXISTS (
           SELECT 1
           FROM jsonb_array_elements(members) AS member
           WHERE member->>'id' = $9
         )
         AND ($10::boolean = FALSE OR leader_id = $9)
       RETURNING *`,
      [
        input.roomId,
        input.mapKey ?? null,
        input.activeChannel ?? null,
        input.sessionKills ?? null,
        input.sessionKillsDelta ?? null,
        input.visibility ?? null,
        input.requests !== undefined ? JSON.stringify(input.requests) : null,
        input.expectedRevision,
        input.viewerId,
        leaderOnly,
      ],
    );
    if ((updated.rowCount ?? 0) > 0) {
      return this.mapPartyRow(updated.rows[0]);
    }

    const current = await this.getPartyRoom(input.roomId);
    if (current === null) {
      throw new PlayerTeamError('NOT_FOUND', 'party room not found');
    }
    if (!current.members.some((member) => member.id === input.viewerId)) {
      throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not a party member');
    }
    if (leaderOnly && current.leaderId !== input.viewerId) {
      throw new PlayerTeamError('UNAUTHORIZED', 'only the party leader can change party settings');
    }
    throw new PlayerTeamError('REVISION_CONFLICT', 'party room revision conflict on update', {
      actualRevision: current.revision,
    });
  }

  public async addPartyRoomPin(
    roomId: string,
    viewerId: string,
    pin: PartyRoomPin,
  ): Promise<PartyRoomRecord> {
    const normalizedPin = { ...pin, partyId: roomId };
    const updated = await this.db.query(
      `UPDATE player_team_party_rooms
       SET pins = COALESCE(
             (SELECT jsonb_agg(item)
                FROM jsonb_array_elements(pins) AS item
               WHERE item->>'id' <> $2),
             '[]'::jsonb
           ) || $3::jsonb,
           revision = revision + 1,
           updated_at = NOW()
       WHERE id = $1
         AND EXISTS (
           SELECT 1
           FROM jsonb_array_elements(members) AS member
           WHERE member->>'id' = $4
         )
       RETURNING *`,
      [roomId, pin.id, JSON.stringify([normalizedPin]), viewerId],
    );
    if ((updated.rowCount ?? 0) > 0) {
      return this.mapPartyRow(updated.rows[0]);
    }

    const current = await this.getPartyRoom(roomId);
    if (current === null) {
      throw new PlayerTeamError('NOT_FOUND', 'party room not found');
    }
    throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not a party member');
  }

  public async removePartyRoomPin(
    roomId: string,
    viewerId: string,
    pinId: string,
  ): Promise<PartyRoomRecord> {
    const updated = await this.db.query(
      `UPDATE player_team_party_rooms
       SET pins = COALESCE(
             (SELECT jsonb_agg(item)
                FROM jsonb_array_elements(pins) AS item
               WHERE item->>'id' <> $2),
             '[]'::jsonb
           ),
           revision = revision + 1,
           updated_at = NOW()
       WHERE id = $1
         AND EXISTS (
           SELECT 1
           FROM jsonb_array_elements(members) AS member
           WHERE member->>'id' = $3
         )
       RETURNING *`,
      [roomId, pinId, viewerId],
    );
    if ((updated.rowCount ?? 0) > 0) {
      return this.mapPartyRow(updated.rows[0]);
    }

    const current = await this.getPartyRoom(roomId);
    if (current === null) {
      throw new PlayerTeamError('NOT_FOUND', 'party room not found');
    }
    throw new PlayerTeamError('UNAUTHORIZED', 'viewer is not a party member');
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
    const normalizedCode = roomCode && roomCode.trim().length > 0 ? roomCode.trim() : null;
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
    if (room.appliedOps.includes(input.operationId)) {
      return room;
    }

    const expectedRevision = input.expectedRevision ?? room.revision;
    if (input.expectedRevision !== null && room.revision !== input.expectedRevision) {
      throw new PlayerTeamError(
        'REVISION_CONFLICT',
        `timer room revision mismatch: expected ${input.expectedRevision}, actual ${room.revision}`,
        { actualRevision: room.revision },
      );
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
         AND revision = $4
         AND NOT (applied_ops ? $5)
       RETURNING *`,
      [
        room.id,
        JSON.stringify(timers),
        JSON.stringify(appliedOps),
        expectedRevision,
        input.operationId,
      ],
    );
    if ((updated.rowCount ?? 0) > 0) {
      return this.mapTimerRow(updated.rows[0]);
    }

    const currentResult = await this.db.query(`SELECT * FROM player_team_timer_rooms WHERE id = $1`, [
      room.id,
    ]);
    const currentRow = currentResult.rows[0];
    if (currentRow === undefined) {
      throw new PlayerTeamError('NOT_FOUND', 'timer room not found');
    }
    const current = this.mapTimerRow(currentRow);
    if (current.appliedOps.includes(input.operationId)) {
      return current;
    }
    throw new PlayerTeamError('REVISION_CONFLICT', 'timer room revision conflict on update', {
      actualRevision: current.revision,
    });
  }
}
