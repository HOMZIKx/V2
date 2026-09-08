import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { PlayerTeamError } from '../../domain/errors.js';
import {
  type TeamInvitationRecord,
  type TeamInvitationsRepositoryPort,
  type TeamInvitationWorkspaceRecord,
  type TeamInvitationWorkspaceUpdate,
} from '../../domain/ports/team-invitations.port.js';
import { type PlayerTeamEnv } from '../config/player-team-env.js';
import { PLAYER_TEAM_ENV } from '../../interface/player-team.tokens.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function parseInvitation(value: unknown): TeamInvitationRecord | null {
  const entry = asRecord(value);
  if (entry === null) return null;
  const status = asString(entry.status);
  if (!['pending', 'accepted', 'declined', 'expired', 'cancelled'].includes(status)) return null;
  const id = asString(entry.id);
  const teamId = asString(entry.teamId);
  const recipientDiscordId = asString(entry.recipientDiscordId);
  if (!id || !teamId || !recipientDiscordId) return null;
  return {
    id,
    teamId,
    teamName: asString(entry.teamName),
    inviterName: asString(entry.inviterName),
    recipientDiscordId,
    recipientDisplayName: asString(entry.recipientDisplayName),
    status: status as TeamInvitationRecord['status'],
    createdLabel: asString(entry.createdLabel),
    expiresLabel: asString(entry.expiresLabel),
    revision: asNumber(entry.revision),
  };
}

@Injectable()
export class TeamInvitationsRepository implements TeamInvitationsRepositoryPort, OnModuleInit {
  private pool: Pool | null = null;

  public constructor(@Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv) {}

  public onModuleInit(): void {
    this.pool = new Pool({ connectionString: this.env.PLAYER_TEAM_DATABASE_URL, max: 6 });
  }

  private get db(): Pool {
    if (this.pool === null) throw new Error('team invitations pool not initialized');
    return this.pool;
  }

  public async findForRecipient(
    invitationId: string,
    recipientDiscordId: string,
  ): Promise<TeamInvitationWorkspaceRecord | null> {
    const result = await this.db.query<{
      workspace_id: string;
      state: Record<string, unknown>;
      revision: number;
    }>(
      `SELECT workspace_id, state, revision
       FROM player_team_workspace_snapshots
       WHERE EXISTS (
         SELECT 1
         FROM jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(state->'invitations') = 'array' THEN state->'invitations'
             ELSE '[]'::jsonb
           END
         ) invitation
         WHERE invitation->>'id' = $1
           AND invitation->>'recipientDiscordId' = $2
       )
       LIMIT 1`,
      [invitationId, recipientDiscordId],
    );

    const row = result.rows[0];
    if (row === undefined) return null;

    const invitations = Array.isArray(row.state.invitations) ? row.state.invitations : [];
    const invitation = invitations
      .map(parseInvitation)
      .find((entry) => entry !== null && entry.id === invitationId && entry.recipientDiscordId === recipientDiscordId);
    if (invitation === undefined || invitation === null) return null;

    return {
      workspaceId: row.workspace_id,
      state: row.state,
      revision: Number(row.revision),
      invitation,
    };
  }

  public async updateWorkspace(input: {
    readonly workspaceId: string;
    readonly state: Record<string, unknown>;
    readonly expectedRevision: number;
    readonly updatedByUserId: string;
  }): Promise<TeamInvitationWorkspaceUpdate> {
    const result = await this.db.query<{
      state: Record<string, unknown>;
      revision: number;
    }>(
      `UPDATE player_team_workspace_snapshots
       SET state = $2::jsonb,
           revision = revision + 1,
           updated_by_user_id = $3,
           updated_at = NOW()
       WHERE workspace_id = $1
         AND revision = $4
       RETURNING state, revision`,
      [
        input.workspaceId,
        JSON.stringify(input.state),
        input.updatedByUserId,
        input.expectedRevision,
      ],
    );

    const row = result.rows[0];
    if (row === undefined) {
      throw new PlayerTeamError('REVISION_CONFLICT', 'team invitation workspace changed concurrently');
    }

    return {
      workspaceId: input.workspaceId,
      state: row.state,
      revision: Number(row.revision),
    };
  }
}
