import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import type {
  CharacterOwnershipPort,
  PlayerWorkspaceRepository,
  TeamDetail,
} from '../../application/ports/player-workspace.ports.js';
import { assertValidClassSpecKey } from '../../domain/class-spec.js';
import { PlayerWorkspaceError } from '../../domain/errors.js';
import type {
  CharacterBoardRecord,
  TeamInvitationRecord,
  TeamMemberRecord,
  TeamRecord,
} from '../../domain/models.js';
import {
  assertCanRemoveMember,
  requireActiveMembership,
  requireOwner,
} from '../../domain/team-rules.js';

type TeamRow = {
  id: string;
  name: string;
  created_by_user_id: string;
  revision: number;
  created_at: Date;
  updated_at: Date;
};

type MemberRow = {
  team_id: string;
  user_id: string;
  role: 'OWNER' | 'MEMBER';
  status: 'ACTIVE' | 'REMOVED';
  joined_at: Date;
  removed_at: Date | null;
};

type InvitationRow = {
  id: string;
  team_id: string;
  target_user_id: string;
  invited_by_user_id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'REVOKED';
  created_at: Date;
  resolved_at: Date | null;
  revision: number;
  operation_id: string | null;
};

type BoardRow = {
  id: string;
  team_id: string;
  display_name: string;
  class_spec_key: string;
  level: number | null;
  linked_player_character_id: string | null;
  created_by_user_id: string;
  revision: number;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
};

function mapTeam(row: TeamRow): TeamRecord {
  return {
    id: row.id,
    name: row.name,
    createdByUserId: row.created_by_user_id,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapMember(row: MemberRow): TeamMemberRecord {
  return {
    teamId: row.team_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at.toISOString(),
    removedAt: row.removed_at?.toISOString() ?? null,
  };
}

function mapInvitation(row: InvitationRow): TeamInvitationRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    targetUserId: row.target_user_id,
    invitedByUserId: row.invited_by_user_id,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    revision: row.revision,
    operationId: row.operation_id,
  };
}

function mapBoard(row: BoardRow): CharacterBoardRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    displayName: row.display_name,
    classSpecKey: row.class_spec_key,
    level: row.level,
    linkedPlayerCharacterId: row.linked_player_character_id,
    createdByUserId: row.created_by_user_id,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    archivedAt: row.archived_at?.toISOString() ?? null,
  };
}

export class PostgresPlayerWorkspaceRepository implements PlayerWorkspaceRepository {
  public constructor(
    private readonly pool: Pool,
    private readonly ownership: CharacterOwnershipPort | null,
  ) {}

  public async createTeam(input: {
    readonly name: string;
    readonly actorUserId: string;
  }): Promise<TeamDetail> {
    const name = input.name.trim();
    if (name.length < 1 || name.length > 80) {
      throw new PlayerWorkspaceError('VALIDATION_FAILED', 'Team name must be 1-80 characters');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const teamId = randomUUID();
      const teamResult = await client.query<TeamRow>(
        `INSERT INTO teams (id, name, created_by_user_id)
         VALUES ($1, $2, $3)
         RETURNING id, name, created_by_user_id, revision, created_at, updated_at`,
        [teamId, name, input.actorUserId],
      );
      await client.query(
        `INSERT INTO team_members (team_id, user_id, role, status)
         VALUES ($1, $2, 'OWNER', 'ACTIVE')`,
        [teamId, input.actorUserId],
      );
      await client.query('COMMIT');
      const team = mapTeam(teamResult.rows[0]!);
      return {
        team,
        members: [
          {
            teamId,
            userId: input.actorUserId,
            role: 'OWNER',
            status: 'ACTIVE',
            joinedAt: team.createdAt,
            removedAt: null,
          },
        ],
        invitations: [],
        viewerRole: 'OWNER',
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async listTeamsForUser(userId: string): Promise<readonly TeamRecord[]> {
    const result = await this.pool.query<TeamRow>(
      `SELECT t.id, t.name, t.created_by_user_id, t.revision, t.created_at, t.updated_at
       FROM teams t
       INNER JOIN team_members m ON m.team_id = t.id
       WHERE m.user_id = $1 AND m.status = 'ACTIVE'
       ORDER BY t.created_at ASC`,
      [userId],
    );
    return result.rows.map(mapTeam);
  }

  public async getActiveMember(teamId: string, userId: string): Promise<TeamMemberRecord | null> {
    const result = await this.pool.query<MemberRow>(
      `SELECT team_id, user_id, role, status, joined_at, removed_at
       FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, userId],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapMember(row);
  }

  public async getTeamDetail(teamId: string, actorUserId: string): Promise<TeamDetail> {
    const member = requireActiveMembership(await this.getActiveMember(teamId, actorUserId));
    const teamResult = await this.pool.query<TeamRow>(
      `SELECT id, name, created_by_user_id, revision, created_at, updated_at FROM teams WHERE id = $1`,
      [teamId],
    );
    const teamRow = teamResult.rows[0];
    if (teamRow === undefined) {
      throw new PlayerWorkspaceError('NOT_FOUND', 'Team not found');
    }
    const members = await this.pool.query<MemberRow>(
      `SELECT team_id, user_id, role, status, joined_at, removed_at
       FROM team_members WHERE team_id = $1 AND status = 'ACTIVE' ORDER BY joined_at ASC`,
      [teamId],
    );
    const invitations = await this.pool.query<InvitationRow>(
      `SELECT id, team_id, target_user_id, invited_by_user_id, status, created_at, resolved_at, revision, operation_id
       FROM team_invitations WHERE team_id = $1 AND status = 'PENDING' ORDER BY created_at ASC`,
      [teamId],
    );
    return {
      team: mapTeam(teamRow),
      members: members.rows.map(mapMember),
      invitations: invitations.rows.map(mapInvitation),
      viewerRole: member.role,
    };
  }

  public async createInvitation(input: {
    readonly teamId: string;
    readonly actorUserId: string;
    readonly targetUserId: string;
    readonly expectedTeamRevision: number;
    readonly operationId: string;
  }): Promise<TeamInvitationRecord> {
    if (input.targetUserId.trim().length === 0) {
      throw new PlayerWorkspaceError('VALIDATION_FAILED', 'targetUserId is required');
    }
    if (input.targetUserId === input.actorUserId) {
      throw new PlayerWorkspaceError('VALIDATION_FAILED', 'Cannot invite yourself');
    }
    if (input.operationId.trim().length === 0) {
      throw new PlayerWorkspaceError('VALIDATION_FAILED', 'operationId is required');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existingOp = await client.query<{ response_json: TeamInvitationRecord }>(
        `SELECT response_json FROM team_mutation_idempotency WHERE operation_id = $1`,
        [input.operationId],
      );
      if (existingOp.rows[0] !== undefined) {
        await client.query('COMMIT');
        return existingOp.rows[0].response_json;
      }

      const member = requireActiveMembership(
        await this.getActiveMemberTx(client, input.teamId, input.actorUserId),
      );
      requireOwner(member);
      await this.bumpTeamRevision(client, input.teamId, input.expectedTeamRevision);

      const existingMember = await this.getActiveMemberTx(client, input.teamId, input.targetUserId);
      if (existingMember !== null) {
        throw new PlayerWorkspaceError('CONFLICT', 'User is already a team member');
      }

      const invitationId = randomUUID();
      const inserted = await client.query<InvitationRow>(
        `INSERT INTO team_invitations (
           id, team_id, target_user_id, invited_by_user_id, status, operation_id
         ) VALUES ($1, $2, $3, $4, 'PENDING', $5)
         RETURNING id, team_id, target_user_id, invited_by_user_id, status, created_at, resolved_at, revision, operation_id`,
        [invitationId, input.teamId, input.targetUserId, input.actorUserId, input.operationId],
      );
      const invitation = mapInvitation(inserted.rows[0]!);
      await client.query(
        `INSERT INTO team_mutation_idempotency (operation_id, team_id, actor_user_id, response_json)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [input.operationId, input.teamId, input.actorUserId, JSON.stringify(invitation)],
      );
      await client.query('COMMIT');
      return invitation;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new PlayerWorkspaceError('CONFLICT', 'Pending invitation already exists');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  public async acceptInvitation(input: {
    readonly invitationId: string;
    readonly actorUserId: string;
    readonly expectedRevision: number;
    readonly operationId: string;
  }): Promise<TeamInvitationRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existingOp = await client.query<{ response_json: TeamInvitationRecord }>(
        `SELECT response_json FROM team_mutation_idempotency WHERE operation_id = $1`,
        [input.operationId],
      );
      if (existingOp.rows[0] !== undefined) {
        await client.query('COMMIT');
        return existingOp.rows[0].response_json;
      }

      const invitation = await this.lockInvitation(client, input.invitationId);
      if (invitation.target_user_id !== input.actorUserId) {
        throw new PlayerWorkspaceError('FORBIDDEN', 'Only the invitee may accept this invitation');
      }
      if (invitation.status === 'ACCEPTED') {
        const mapped = mapInvitation(invitation);
        await client.query('COMMIT');
        return mapped;
      }
      if (invitation.status !== 'PENDING') {
        throw new PlayerWorkspaceError('CONFLICT', `Invitation is ${invitation.status}`);
      }
      if (invitation.revision !== input.expectedRevision) {
        throw new PlayerWorkspaceError('CONFLICT', 'Invitation revision mismatch', {
          expectedRevision: input.expectedRevision,
          actualRevision: invitation.revision,
        });
      }

      await client.query(
        `INSERT INTO team_members (team_id, user_id, role, status)
         VALUES ($1, $2, 'MEMBER', 'ACTIVE')
         ON CONFLICT (team_id, user_id) DO UPDATE
           SET role = 'MEMBER', status = 'ACTIVE', removed_at = NULL, joined_at = now()`,
        [invitation.team_id, input.actorUserId],
      );
      const updated = await client.query<InvitationRow>(
        `UPDATE team_invitations
         SET status = 'ACCEPTED', resolved_at = now(), revision = revision + 1
         WHERE id = $1
         RETURNING id, team_id, target_user_id, invited_by_user_id, status, created_at, resolved_at, revision, operation_id`,
        [input.invitationId],
      );
      const mapped = mapInvitation(updated.rows[0]!);
      await client.query(
        `INSERT INTO team_mutation_idempotency (operation_id, team_id, actor_user_id, response_json)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [input.operationId, invitation.team_id, input.actorUserId, JSON.stringify(mapped)],
      );
      await client.query('COMMIT');
      return mapped;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async rejectInvitation(input: {
    readonly invitationId: string;
    readonly actorUserId: string;
    readonly expectedRevision: number;
  }): Promise<TeamInvitationRecord> {
    return this.resolveInvitationAsTarget(input, 'REJECTED');
  }

  public async revokeInvitation(input: {
    readonly invitationId: string;
    readonly actorUserId: string;
    readonly expectedRevision: number;
  }): Promise<TeamInvitationRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const invitation = await this.lockInvitation(client, input.invitationId);
      const member = requireActiveMembership(
        await this.getActiveMemberTx(client, invitation.team_id, input.actorUserId),
      );
      requireOwner(member);
      if (invitation.status !== 'PENDING') {
        throw new PlayerWorkspaceError('CONFLICT', `Invitation is ${invitation.status}`);
      }
      if (invitation.revision !== input.expectedRevision) {
        throw new PlayerWorkspaceError('CONFLICT', 'Invitation revision mismatch', {
          expectedRevision: input.expectedRevision,
          actualRevision: invitation.revision,
        });
      }
      const updated = await client.query<InvitationRow>(
        `UPDATE team_invitations
         SET status = 'REVOKED', resolved_at = now(), revision = revision + 1
         WHERE id = $1
         RETURNING id, team_id, target_user_id, invited_by_user_id, status, created_at, resolved_at, revision, operation_id`,
        [input.invitationId],
      );
      await client.query('COMMIT');
      return mapInvitation(updated.rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async removeMember(input: {
    readonly teamId: string;
    readonly actorUserId: string;
    readonly targetUserId: string;
    readonly expectedTeamRevision: number;
  }): Promise<TeamDetail> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const actor = requireActiveMembership(
        await this.getActiveMemberTx(client, input.teamId, input.actorUserId),
      );
      const target = await this.getActiveMemberTx(client, input.teamId, input.targetUserId);
      if (target === null || target.status !== 'ACTIVE') {
        throw new PlayerWorkspaceError('NOT_FOUND', 'Member not found');
      }
      const owners = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM team_members
         WHERE team_id = $1 AND status = 'ACTIVE' AND role = 'OWNER'`,
        [input.teamId],
      );
      assertCanRemoveMember({
        actorRole: actor.role,
        targetRole: target.role,
        activeOwnerCount: Number(owners.rows[0]?.count ?? '0'),
        targetUserId: input.targetUserId,
        actorUserId: input.actorUserId,
      });
      await this.bumpTeamRevision(client, input.teamId, input.expectedTeamRevision);
      await client.query(
        `UPDATE team_members
         SET status = 'REMOVED', removed_at = now()
         WHERE team_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
        [input.teamId, input.targetUserId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return this.getTeamDetail(input.teamId, input.actorUserId);
  }

  public async listPendingInvitationsForUser(userId: string): Promise<
    readonly (TeamInvitationRecord & {
      readonly teamName: string;
    })[]
  > {
    const result = await this.pool.query<
      InvitationRow & {
        team_name: string;
      }
    >(
      `SELECT i.id, i.team_id, i.target_user_id, i.invited_by_user_id, i.status,
              i.created_at, i.resolved_at, i.revision, i.operation_id, t.name AS team_name
       FROM team_invitations i
       INNER JOIN teams t ON t.id = i.team_id
       WHERE i.target_user_id = $1 AND i.status = 'PENDING'
       ORDER BY i.created_at ASC`,
      [userId],
    );
    return result.rows.map((row) => ({
      ...mapInvitation(row),
      teamName: row.team_name,
    }));
  }

  public async listCharacterBoards(
    teamId: string,
    actorUserId: string,
  ): Promise<readonly CharacterBoardRecord[]> {
    requireActiveMembership(await this.getActiveMember(teamId, actorUserId));
    const result = await this.pool.query<BoardRow>(
      `SELECT id, team_id, display_name, class_spec_key, level, linked_player_character_id,
              created_by_user_id, revision, created_at, updated_at, archived_at
       FROM team_character_boards
       WHERE team_id = $1 AND archived_at IS NULL
       ORDER BY created_at ASC`,
      [teamId],
    );
    return result.rows.map(mapBoard);
  }

  public async getCharacterBoard(
    teamId: string,
    boardId: string,
    actorUserId: string,
  ): Promise<CharacterBoardRecord> {
    requireActiveMembership(await this.getActiveMember(teamId, actorUserId));
    const result = await this.pool.query<BoardRow>(
      `SELECT id, team_id, display_name, class_spec_key, level, linked_player_character_id,
              created_by_user_id, revision, created_at, updated_at, archived_at
       FROM team_character_boards
       WHERE team_id = $1 AND id = $2 AND archived_at IS NULL`,
      [teamId, boardId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new PlayerWorkspaceError('NOT_FOUND', 'Character board not found');
    }
    return mapBoard(row);
  }

  public async createCharacterBoard(input: {
    readonly teamId: string;
    readonly actorUserId: string;
    readonly expectedTeamRevision: number;
    readonly displayName: string;
    readonly classSpecKey: string;
    readonly level: number | null;
    readonly linkedPlayerCharacterId: string | null;
    readonly operationId: string;
  }): Promise<{ readonly board: CharacterBoardRecord; readonly teamRevision: number }> {
    const displayName = input.displayName.trim();
    if (displayName.length < 2 || displayName.length > 24) {
      throw new PlayerWorkspaceError('VALIDATION_FAILED', 'displayName must be 2-24 characters');
    }
    assertValidClassSpecKey(input.classSpecKey);
    if (input.linkedPlayerCharacterId !== null) {
      if (this.ownership === null) {
        throw new PlayerWorkspaceError(
          'CONFIG_INVALID',
          'Identity ownership client is not configured',
        );
      }
      await this.ownership.assertOwnedByActor({
        characterId: input.linkedPlayerCharacterId,
        v2UserId: input.actorUserId,
      });
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existingOp = await client.query<{
        response_json: { board: CharacterBoardRecord; teamRevision: number };
      }>(`SELECT response_json FROM team_mutation_idempotency WHERE operation_id = $1`, [
        input.operationId,
      ]);
      if (existingOp.rows[0] !== undefined) {
        await client.query('COMMIT');
        return existingOp.rows[0].response_json;
      }

      requireActiveMembership(
        await this.getActiveMemberTx(client, input.teamId, input.actorUserId),
      );
      const teamRevision = await this.bumpTeamRevision(
        client,
        input.teamId,
        input.expectedTeamRevision,
      );
      const boardId = randomUUID();
      const inserted = await client.query<BoardRow>(
        `INSERT INTO team_character_boards (
           id, team_id, display_name, class_spec_key, level, linked_player_character_id, created_by_user_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, team_id, display_name, class_spec_key, level, linked_player_character_id,
                   created_by_user_id, revision, created_at, updated_at, archived_at`,
        [
          boardId,
          input.teamId,
          displayName,
          input.classSpecKey,
          input.level,
          input.linkedPlayerCharacterId,
          input.actorUserId,
        ],
      );
      const board = mapBoard(inserted.rows[0]!);
      const response = { board, teamRevision };
      await client.query(
        `INSERT INTO team_mutation_idempotency (operation_id, team_id, actor_user_id, response_json)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [input.operationId, input.teamId, input.actorUserId, JSON.stringify(response)],
      );
      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async updateCharacterBoard(input: {
    readonly teamId: string;
    readonly boardId: string;
    readonly actorUserId: string;
    readonly expectedBoardRevision: number;
    readonly displayName: string;
    readonly classSpecKey: string;
    readonly level: number | null;
    readonly linkedPlayerCharacterId: string | null;
  }): Promise<CharacterBoardRecord> {
    const displayName = input.displayName.trim();
    if (displayName.length < 2 || displayName.length > 24) {
      throw new PlayerWorkspaceError('VALIDATION_FAILED', 'displayName must be 2-24 characters');
    }
    assertValidClassSpecKey(input.classSpecKey);
    if (input.linkedPlayerCharacterId !== null) {
      if (this.ownership === null) {
        throw new PlayerWorkspaceError(
          'CONFIG_INVALID',
          'Identity ownership client is not configured',
        );
      }
      await this.ownership.assertOwnedByActor({
        characterId: input.linkedPlayerCharacterId,
        v2UserId: input.actorUserId,
      });
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      requireActiveMembership(
        await this.getActiveMemberTx(client, input.teamId, input.actorUserId),
      );
      const current = await client.query<BoardRow>(
        `SELECT id, team_id, display_name, class_spec_key, level, linked_player_character_id,
                created_by_user_id, revision, created_at, updated_at, archived_at
         FROM team_character_boards
         WHERE team_id = $1 AND id = $2 AND archived_at IS NULL
         FOR UPDATE`,
        [input.teamId, input.boardId],
      );
      const row = current.rows[0];
      if (row === undefined) {
        throw new PlayerWorkspaceError('NOT_FOUND', 'Character board not found');
      }
      if (row.revision !== input.expectedBoardRevision) {
        throw new PlayerWorkspaceError('CONFLICT', 'Character board revision mismatch', {
          expectedRevision: input.expectedBoardRevision,
          actualRevision: row.revision,
        });
      }
      const updated = await client.query<BoardRow>(
        `UPDATE team_character_boards
         SET display_name = $3,
             class_spec_key = $4,
             level = $5,
             linked_player_character_id = $6,
             revision = revision + 1,
             updated_at = now()
         WHERE team_id = $1 AND id = $2
         RETURNING id, team_id, display_name, class_spec_key, level, linked_player_character_id,
                   created_by_user_id, revision, created_at, updated_at, archived_at`,
        [
          input.teamId,
          input.boardId,
          displayName,
          input.classSpecKey,
          input.level,
          input.linkedPlayerCharacterId,
        ],
      );
      await client.query('COMMIT');
      return mapBoard(updated.rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async resolveInvitationAsTarget(
    input: {
      readonly invitationId: string;
      readonly actorUserId: string;
      readonly expectedRevision: number;
    },
    status: 'REJECTED',
  ): Promise<TeamInvitationRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const invitation = await this.lockInvitation(client, input.invitationId);
      if (invitation.target_user_id !== input.actorUserId) {
        throw new PlayerWorkspaceError('FORBIDDEN', 'Only the invitee may reject this invitation');
      }
      if (invitation.status !== 'PENDING') {
        throw new PlayerWorkspaceError('CONFLICT', `Invitation is ${invitation.status}`);
      }
      if (invitation.revision !== input.expectedRevision) {
        throw new PlayerWorkspaceError('CONFLICT', 'Invitation revision mismatch', {
          expectedRevision: input.expectedRevision,
          actualRevision: invitation.revision,
        });
      }
      const updated = await client.query<InvitationRow>(
        `UPDATE team_invitations
         SET status = $2, resolved_at = now(), revision = revision + 1
         WHERE id = $1
         RETURNING id, team_id, target_user_id, invited_by_user_id, status, created_at, resolved_at, revision, operation_id`,
        [input.invitationId, status],
      );
      await client.query('COMMIT');
      return mapInvitation(updated.rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async getActiveMemberTx(
    client: PoolClient,
    teamId: string,
    userId: string,
  ): Promise<TeamMemberRecord | null> {
    const result = await client.query<MemberRow>(
      `SELECT team_id, user_id, role, status, joined_at, removed_at
       FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, userId],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapMember(row);
  }

  private async lockInvitation(client: PoolClient, invitationId: string): Promise<InvitationRow> {
    const result = await client.query<InvitationRow>(
      `SELECT id, team_id, target_user_id, invited_by_user_id, status, created_at, resolved_at, revision, operation_id
       FROM team_invitations WHERE id = $1 FOR UPDATE`,
      [invitationId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new PlayerWorkspaceError('NOT_FOUND', 'Invitation not found');
    }
    return row;
  }

  private async bumpTeamRevision(
    client: PoolClient,
    teamId: string,
    expectedRevision: number,
  ): Promise<number> {
    const result = await client.query<TeamRow>(
      `UPDATE teams
       SET revision = revision + 1, updated_at = now()
       WHERE id = $1 AND revision = $2
       RETURNING id, name, created_by_user_id, revision, created_at, updated_at`,
      [teamId, expectedRevision],
    );
    const row = result.rows[0];
    if (row === undefined) {
      const current = await client.query<{ revision: number }>(
        `SELECT revision FROM teams WHERE id = $1`,
        [teamId],
      );
      throw new PlayerWorkspaceError('CONFLICT', 'Team revision mismatch', {
        expectedRevision,
        actualRevision: current.rows[0]?.revision ?? null,
      });
    }
    return row.revision;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}
