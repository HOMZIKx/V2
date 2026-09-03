import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { createLogger } from '@v2/observability';

import { type PlayerTeamEnv } from '../config/player-team-env.js';
import { PLAYER_TEAM_ENV } from '../../interface/player-team.tokens.js';

export type PlayerTeamWorkspaceStateRecord = {
  readonly workspaceId: string;
  readonly state: unknown;
  readonly revision: number;
  readonly updatedAtIso: string;
};

@Injectable()
export class PlayerTeamStateRepository implements OnModuleInit {
  private readonly logger = createLogger('player-team-state-repository');
  private pool: Pool | null = null;

  public constructor(@Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv) {}

  public onModuleInit(): void | Promise<void> {
    this.pool = new Pool({
      connectionString: this.env.PLAYER_TEAM_DATABASE_URL,
      max: 10,
    });

    // Ensure schema (safe for dev; real prod should rely on migrations).
    // JSONB stores the full workspace snapshot for MVP online persistence.
    return this.ensureSchema();
  }

  public async ensureSchema(): Promise<void> {
    if (this.pool === null) return;

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS player_team_workspaces (
        owner_user_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        state JSONB NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (owner_user_id, workspace_id)
      );

      CREATE INDEX IF NOT EXISTS idx_player_team_workspaces_owner_updated
        ON player_team_workspaces (owner_user_id, updated_at DESC);
    `);
    this.logger.info('player-team schema ensured.');
  }

  public async listWorkspacesForOwner(ownerUserId: string): Promise<PlayerTeamWorkspaceStateRecord[]> {
    if (this.pool === null) throw new Error('player-team pool not initialized');

    const result = await this.pool.query<{
      workspace_id: string;
      state: unknown;
      revision: number;
      updated_at: string;
    }>(
      `
      SELECT workspace_id, state, revision, updated_at
      FROM player_team_workspaces
      WHERE owner_user_id = $1
      ORDER BY updated_at DESC
      `,
      [ownerUserId],
    );

    return result.rows.map((r) => ({
      workspaceId: r.workspace_id,
      state: r.state,
      revision: Number(r.revision),
      updatedAtIso: new Date(r.updated_at).toISOString(),
    }));
  }

  public async getWorkspaceState(
    ownerUserId: string,
    workspaceId: string,
  ): Promise<PlayerTeamWorkspaceStateRecord | null> {
    if (this.pool === null) throw new Error('player-team pool not initialized');

    const result = await this.pool.query<{
      workspace_id: string;
      state: unknown;
      revision: number;
      updated_at: string;
    }>(
      `
      SELECT workspace_id, state, revision, updated_at
      FROM player_team_workspaces
      WHERE owner_user_id = $1 AND workspace_id = $2
      `,
      [ownerUserId, workspaceId],
    );

    if (result.rowCount === 0) return null;

    const r = result.rows[0];
    if (r === undefined) return null;
    return {
      workspaceId: r.workspace_id,
      state: r.state,
      revision: Number(r.revision),
      updatedAtIso: new Date(r.updated_at).toISOString(),
    };
  }

  public async upsertWorkspaceState(input: {
    readonly ownerUserId: string;
    readonly workspaceId: string;
    readonly state: unknown;
    readonly expectedRevision: number | null;
  }): Promise<{ readonly revision: number }> {
    if (this.pool === null) throw new Error('player-team pool not initialized');

    const stateJson = JSON.stringify(input.state ?? null);

    if (input.expectedRevision === null) {
      const result = await this.pool.query<{ revision: number }>(
        `
        INSERT INTO player_team_workspaces (owner_user_id, workspace_id, state, revision, updated_at)
        VALUES ($1, $2, $3::jsonb, COALESCE($4, 0), NOW())
        ON CONFLICT (owner_user_id, workspace_id)
        DO UPDATE SET
          state = $3::jsonb,
          revision = player_team_workspaces.revision + 1,
          updated_at = NOW()
        RETURNING revision
        `,
        [input.ownerUserId, input.workspaceId, stateJson, 0],
      );

      return { revision: Number(result.rows[0]?.revision ?? 0) };
    }

    // Revision check: update only if current revision matches.
    const result = await this.pool.query<{ revision: number }>(
      `
      WITH existing AS (
        SELECT revision
        FROM player_team_workspaces
        WHERE owner_user_id = $1 AND workspace_id = $2
      ),
      updated AS (
        UPDATE player_team_workspaces
        SET state = $3::jsonb,
            revision = revision + 1,
            updated_at = NOW()
        WHERE owner_user_id = $1
          AND workspace_id = $2
          AND revision = $4
        RETURNING revision
      )
      INSERT INTO player_team_workspaces (owner_user_id, workspace_id, state, revision, updated_at)
      SELECT $1, $2, $3::jsonb, 0, NOW()
      WHERE NOT EXISTS (SELECT 1 FROM existing)
        AND $4 = 0
      RETURNING revision
      `,
      [input.ownerUserId, input.workspaceId, stateJson, input.expectedRevision],
    );

    // If nothing updated/inserted, we need to distinguish between:
    // - missing workspace with non-zero expected revision
    // - revision mismatch
    if (result.rowCount === 0) {
      const current = await this.getWorkspaceState(input.ownerUserId, input.workspaceId);
      if (current === null) {
        throw new Error('expected revision but workspace does not exist');
      }
      throw new Error(`revision mismatch: expected ${input.expectedRevision}, got ${current.revision}`);
    }

    return { revision: Number(result.rows[0]?.revision ?? 0) };
  }
}

