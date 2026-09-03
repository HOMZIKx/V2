import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { createLogger } from '@v2/observability';

import { type PlayerTeamEnv } from '../config/player-team-env.js';
import { PLAYER_TEAM_ENV } from '../../interface/player-team.tokens.js';

export type ViewerSnapshotRecord = {
  readonly ownerUserId: string;
  readonly state: Record<string, unknown>;
  readonly revision: number;
  readonly updatedAtIso: string;
};

export type ViewerSnapshotUpsertResult = {
  readonly revision: number;
};

@Injectable()
export class PlayerTeamStateRepository implements OnModuleInit {
  private readonly logger = createLogger('player-team-state-repository');
  private pool: Pool | null = null;

  public constructor(@Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv) {}

  public onModuleInit(): void {
    this.pool = new Pool({
      connectionString: this.env.PLAYER_TEAM_DATABASE_URL,
      max: 10,
    });
    this.logger.info('player-team database pool created.');
  }

  private get db(): Pool {
    if (this.pool === null) throw new Error('player-team pool not initialized');
    return this.pool;
  }

  // -------------------------------------------------------------------------
  // Viewer snapshot — stores the full PlayerStoreState as JSONB per viewer.
  // Used by the Web dev-sync adapter until per-mutation endpoints are live.
  // Table: player_team_viewer_snapshots (created by migration 001_initial_schema.sql)
  // -------------------------------------------------------------------------

  public async getViewerSnapshot(ownerUserId: string): Promise<ViewerSnapshotRecord | null> {
    const result = await this.db.query<{
      owner_user_id: string;
      state: Record<string, unknown>;
      revision: number;
      updated_at: string;
    }>(
      `SELECT owner_user_id, state, revision, updated_at
       FROM player_team_viewer_snapshots
       WHERE owner_user_id = $1`,
      [ownerUserId],
    );

    const row = result.rows[0];
    if (row === undefined) return null;

    return {
      ownerUserId: row.owner_user_id,
      state: row.state,
      revision: Number(row.revision),
      updatedAtIso: new Date(row.updated_at).toISOString(),
    };
  }

  public async upsertViewerSnapshot(input: {
    readonly ownerUserId: string;
    readonly state: Record<string, unknown>;
    readonly expectedRevision: number | null;
  }): Promise<ViewerSnapshotUpsertResult> {
    const stateJson = JSON.stringify(input.state);

    if (input.expectedRevision === null) {
      // Blind upsert — no optimistic concurrency check.
      const result = await this.db.query<{ revision: number }>(
        `INSERT INTO player_team_viewer_snapshots (owner_user_id, state, revision, updated_at)
         VALUES ($1, $2::jsonb, 0, NOW())
         ON CONFLICT (owner_user_id)
         DO UPDATE SET
           state      = EXCLUDED.state,
           revision   = player_team_viewer_snapshots.revision + 1,
           updated_at = NOW()
         RETURNING revision`,
        [input.ownerUserId, stateJson],
      );

      return { revision: Number(result.rows[0]?.revision ?? 0) };
    }

    // Optimistic concurrency: update only if current revision matches.
    const result = await this.db.query<{ revision: number }>(
      `UPDATE player_team_viewer_snapshots
       SET state      = $2::jsonb,
           revision   = revision + 1,
           updated_at = NOW()
       WHERE owner_user_id = $1
         AND revision = $3
       RETURNING revision`,
      [input.ownerUserId, stateJson, input.expectedRevision],
    );

    if ((result.rowCount ?? 0) > 0) {
      return { revision: Number(result.rows[0]?.revision ?? 0) };
    }

    // Rows affected = 0 — either doesn't exist or revision mismatch.
    // If doesn't exist and expectedRevision == 0, do an insert.
    if (input.expectedRevision === 0) {
      const insertResult = await this.db.query<{ revision: number }>(
        `INSERT INTO player_team_viewer_snapshots (owner_user_id, state, revision, updated_at)
         VALUES ($1, $2::jsonb, 0, NOW())
         ON CONFLICT DO NOTHING
         RETURNING revision`,
        [input.ownerUserId, stateJson],
      );

      if ((insertResult.rowCount ?? 0) > 0) {
        return { revision: Number(insertResult.rows[0]?.revision ?? 0) };
      }
    }

    // Fetch current to report the actual revision in the conflict message.
    const current = await this.getViewerSnapshot(input.ownerUserId);
    const actual = current?.revision ?? null;
    throw Object.assign(
      new Error(
        `viewer snapshot revision mismatch: expected ${input.expectedRevision}, actual ${actual}`,
      ),
      { code: 'REVISION_CONFLICT', actual },
    );
  }
}
