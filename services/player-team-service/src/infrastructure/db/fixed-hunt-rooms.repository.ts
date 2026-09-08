import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { createLogger } from '@v2/observability';

import { PlayerTeamError } from '../../domain/errors.js';
import {
  type FixedHuntRoomRecord,
  type FixedHuntRoomsRepositoryPort,
  type UpdateFixedHuntRoomInput,
} from '../../domain/ports/fixed-hunt-rooms.port.js';
import { type PlayerTeamEnv } from '../config/player-team-env.js';
import { PLAYER_TEAM_ENV } from '../../interface/player-team.tokens.js';

@Injectable()
export class FixedHuntRoomsRepository implements FixedHuntRoomsRepositoryPort, OnModuleInit {
  private readonly logger = createLogger('fixed-hunt-rooms-repository');
  private pool: Pool | null = null;

  public constructor(@Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv) {}

  public onModuleInit(): void {
    this.pool = new Pool({
      connectionString: this.env.PLAYER_TEAM_DATABASE_URL,
      max: 10,
    });
    this.logger.info('fixed hunt rooms database pool created.');
  }

  private get db(): Pool {
    if (this.pool === null) throw new Error('fixed hunt rooms pool not initialized');
    return this.pool;
  }

  private mapRow(row: {
    room_key: string;
    state: Record<string, unknown>;
    revision: number | string;
    updated_by_user_id: string | null;
    updated_at: string | Date;
  }): FixedHuntRoomRecord {
    return {
      roomKey: row.room_key,
      state: row.state && typeof row.state === 'object' ? row.state : {},
      revision: Number(row.revision),
      updatedByUserId: row.updated_by_user_id,
      updatedAtIso: new Date(row.updated_at).toISOString(),
    };
  }

  public async getOrCreateFixedHuntRoom(roomKey: string): Promise<FixedHuntRoomRecord> {
    const result = await this.db.query(
      `INSERT INTO player_team_fixed_hunt_rooms
        (room_key, state, revision, updated_by_user_id, updated_at)
       VALUES ($1, $2::jsonb, 0, NULL, NOW())
       ON CONFLICT (room_key) DO UPDATE
         SET room_key = EXCLUDED.room_key
       RETURNING *`,
      [
        roomKey,
        JSON.stringify({
          roomKey,
          routes: [],
          markers: [],
          requests: [],
          history: [],
        }),
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  public async updateFixedHuntRoom(input: UpdateFixedHuntRoomInput): Promise<FixedHuntRoomRecord> {
    await this.getOrCreateFixedHuntRoom(input.roomKey);
    const updated = await this.db.query(
      `UPDATE player_team_fixed_hunt_rooms
       SET state = $2::jsonb,
           revision = revision + 1,
           updated_by_user_id = $3,
           updated_at = NOW()
       WHERE room_key = $1 AND revision = $4
       RETURNING *`,
      [input.roomKey, JSON.stringify(input.state), input.viewerId, input.expectedRevision],
    );

    if ((updated.rowCount ?? 0) === 0) {
      const current = await this.getOrCreateFixedHuntRoom(input.roomKey);
      throw new PlayerTeamError(
        'REVISION_CONFLICT',
        `fixed hunt room revision mismatch: expected ${input.expectedRevision}, actual ${current.revision}`,
        { actualRevision: current.revision },
      );
    }

    return this.mapRow(updated.rows[0]);
  }
}
