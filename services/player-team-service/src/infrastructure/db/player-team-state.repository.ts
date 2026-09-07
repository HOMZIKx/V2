import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { createLogger } from '@v2/observability';

import { PlayerTeamError } from '../../domain/errors.js';
import {
  type PlayerTeamStateRepositoryPort,
  type ViewerSnapshotRecord,
  type ViewerSnapshotUpsertInput,
  type ViewerSnapshotUpsertResult,
  type WorkspaceSnapshotRecord,
  type WorkspaceSnapshotUpsertInput,
} from '../../domain/ports/player-team-state.port.js';
import { type PlayerTeamEnv } from '../config/player-team-env.js';
import { PLAYER_TEAM_ENV } from '../../interface/player-team.tokens.js';

@Injectable()
export class PlayerTeamStateRepository implements PlayerTeamStateRepositoryPort, OnModuleInit {
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

  public async pingDatabase(): Promise<boolean> {
    try {
      await this.db.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  public async isMigrationApplied(migrationId: string): Promise<boolean> {
    try {
      const result = await this.db.query<{ id: string }>(
        'SELECT id FROM player_team_schema_migrations WHERE id = $1',
        [migrationId],
      );
      return (result.rowCount ?? 0) > 0;
    } catch {
      return false;
    }
  }

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

  public async upsertViewerSnapshot(
    input: ViewerSnapshotUpsertInput,
  ): Promise<ViewerSnapshotUpsertResult> {
    const stateJson = JSON.stringify(input.state);

    if (input.expectedRevision === null) {
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

      const current = await this.getViewerSnapshot(input.ownerUserId);
      const actual = current?.revision ?? null;
      throw new PlayerTeamError(
        'REVISION_CONFLICT',
        `viewer snapshot already exists: expected no revision, actual ${actual}`,
        { actualRevision: actual },
      );
    }

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

    const current = await this.getViewerSnapshot(input.ownerUserId);
    const actual = current?.revision ?? null;
    throw new PlayerTeamError(
      'REVISION_CONFLICT',
      `viewer snapshot revision mismatch: expected ${input.expectedRevision}, actual ${actual}`,
      { actualRevision: actual },
    );
  }

  public async getWorkspaceSnapshot(workspaceId: string): Promise<WorkspaceSnapshotRecord | null> {
    const result = await this.db.query<{
      workspace_id: string;
      state: Record<string, unknown>;
      revision: number;
      updated_by_user_id: string;
      updated_at: string;
    }>(
      `SELECT workspace_id, state, revision, updated_by_user_id, updated_at
       FROM player_team_workspace_snapshots
       WHERE workspace_id = $1`,
      [workspaceId],
    );

    const row = result.rows[0];
    if (row === undefined) return null;

    return {
      workspaceId: row.workspace_id,
      state: row.state,
      revision: Number(row.revision),
      updatedByUserId: row.updated_by_user_id,
      updatedAtIso: new Date(row.updated_at).toISOString(),
    };
  }

  public async upsertWorkspaceSnapshot(
    input: WorkspaceSnapshotUpsertInput,
  ): Promise<WorkspaceSnapshotRecord> {
    const stateJson = JSON.stringify(input.state);

    if (input.expectedRevision === null) {
      const insert = await this.db.query<{
        workspace_id: string;
        state: Record<string, unknown>;
        revision: number;
        updated_by_user_id: string;
        updated_at: string;
      }>(
        `INSERT INTO player_team_workspace_snapshots
           (workspace_id, state, revision, updated_by_user_id, updated_at)
         VALUES ($1, $2::jsonb, 0, $3, NOW())
         ON CONFLICT DO NOTHING
         RETURNING workspace_id, state, revision, updated_by_user_id, updated_at`,
        [input.workspaceId, stateJson, input.updatedByUserId],
      );
      const row = insert.rows[0];
      if (row !== undefined) {
        return {
          workspaceId: row.workspace_id,
          state: row.state,
          revision: Number(row.revision),
          updatedByUserId: row.updated_by_user_id,
          updatedAtIso: new Date(row.updated_at).toISOString(),
        };
      }

      const current = await this.getWorkspaceSnapshot(input.workspaceId);
      const actual = current?.revision ?? null;
      throw new PlayerTeamError(
        'REVISION_CONFLICT',
        `workspace snapshot already exists: expected no revision, actual ${actual}`,
        { actualRevision: actual },
      );
    }

    const update = await this.db.query<{
      workspace_id: string;
      state: Record<string, unknown>;
      revision: number;
      updated_by_user_id: string;
      updated_at: string;
    }>(
      `UPDATE player_team_workspace_snapshots
       SET state = $2::jsonb,
           revision = revision + 1,
           updated_by_user_id = $3,
           updated_at = NOW()
       WHERE workspace_id = $1
         AND revision = $4
       RETURNING workspace_id, state, revision, updated_by_user_id, updated_at`,
      [input.workspaceId, stateJson, input.updatedByUserId, input.expectedRevision],
    );
    const row = update.rows[0];
    if (row !== undefined) {
      return {
        workspaceId: row.workspace_id,
        state: row.state,
        revision: Number(row.revision),
        updatedByUserId: row.updated_by_user_id,
        updatedAtIso: new Date(row.updated_at).toISOString(),
      };
    }

    const current = await this.getWorkspaceSnapshot(input.workspaceId);
    const actual = current?.revision ?? null;
    throw new PlayerTeamError(
      'REVISION_CONFLICT',
      `workspace snapshot revision mismatch: expected ${input.expectedRevision}, actual ${actual}`,
      { actualRevision: actual },
    );
  }
}
