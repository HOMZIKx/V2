import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { createLogger } from '@v2/observability';

import { PlayerTeamError } from '../../domain/errors.js';
import {
  type MetinGeneralHuntRecord,
  type MetinGeneralHuntsRepositoryPort,
  type UpdateMetinGeneralHuntInput,
} from '../../domain/ports/metin-general-hunts.port.js';
import { type PlayerTeamEnv } from '../config/player-team-env.js';
import { PLAYER_TEAM_ENV } from '../../interface/player-team.tokens.js';

@Injectable()
export class MetinGeneralHuntsRepository implements MetinGeneralHuntsRepositoryPort, OnModuleInit {
  private readonly logger = createLogger('metin-general-hunts-repository');
  private pool: Pool | null = null;

  public constructor(@Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv) {}

  public onModuleInit(): void {
    this.pool = new Pool({
      connectionString: this.env.PLAYER_TEAM_DATABASE_URL,
      max: 10,
    });
    this.logger.info('metin/general hunts database pool created.');
  }

  private get db(): Pool {
    if (this.pool === null) throw new Error('metin/general hunts pool not initialized');
    return this.pool;
  }

  private mapRow(row: {
    hunt_key: string;
    state: Record<string, unknown>;
    revision: number | string;
    updated_by_user_id: string | null;
    updated_at: string | Date;
  }): MetinGeneralHuntRecord {
    return {
      huntKey: row.hunt_key,
      state: row.state && typeof row.state === 'object' ? row.state : {},
      revision: Number(row.revision),
      updatedByUserId: row.updated_by_user_id,
      updatedAtIso: new Date(row.updated_at).toISOString(),
    };
  }

  public async getOrCreateHunt(huntKey: string): Promise<MetinGeneralHuntRecord> {
    const existing = await this.db.query(
      `SELECT * FROM player_team_metin_general_hunts WHERE hunt_key = $1`,
      [huntKey],
    );
    if (existing.rows[0] !== undefined) return this.mapRow(existing.rows[0]);

    const initialState = JSON.stringify({
      huntKey,
      routes: [],
      markers: [],
      requests: [],
      history: [],
    });
    const inserted = await this.db.query(
      `INSERT INTO player_team_metin_general_hunts
        (hunt_key, state, revision, updated_by_user_id, updated_at)
       VALUES ($1, $2::jsonb, 0, NULL, NOW())
       ON CONFLICT (hunt_key) DO NOTHING
       RETURNING *`,
      [huntKey, initialState],
    );
    if (inserted.rows[0] !== undefined) return this.mapRow(inserted.rows[0]);

    const raced = await this.db.query(
      `SELECT * FROM player_team_metin_general_hunts WHERE hunt_key = $1`,
      [huntKey],
    );
    if (raced.rows[0] === undefined) {
      throw new PlayerTeamError('NOT_FOUND', 'metin/general hunt could not be initialised');
    }
    return this.mapRow(raced.rows[0]);
  }

  public async updateHunt(input: UpdateMetinGeneralHuntInput): Promise<MetinGeneralHuntRecord> {
    await this.getOrCreateHunt(input.huntKey);
    const updated = await this.db.query(
      `UPDATE player_team_metin_general_hunts
       SET state = $2::jsonb,
           revision = revision + 1,
           updated_by_user_id = $3,
           updated_at = NOW()
       WHERE hunt_key = $1 AND revision = $4
       RETURNING *`,
      [input.huntKey, JSON.stringify(input.state), input.viewerId, input.expectedRevision],
    );

    if ((updated.rowCount ?? 0) === 0) {
      const current = await this.getOrCreateHunt(input.huntKey);
      throw new PlayerTeamError(
        'REVISION_CONFLICT',
        `metin/general hunt revision mismatch: expected ${input.expectedRevision}, actual ${current.revision}`,
        { actualRevision: current.revision },
      );
    }

    return this.mapRow(updated.rows[0]);
  }
}
