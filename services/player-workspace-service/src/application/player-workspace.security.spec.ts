import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type {
  CharacterOwnershipPort,
  PlayerWorkspaceRepository,
  TeamDetail,
} from '../application/ports/player-workspace.ports.js';
import { PlayerWorkspaceError } from '../domain/errors.js';
import type {
  CharacterBoardRecord,
  TeamInvitationRecord,
  TeamMemberRecord,
  TeamRecord,
} from '../domain/models.js';
import {
  assertCanRemoveMember,
  requireActiveMembership,
  requireOwner,
} from '../domain/team-rules.js';

class MemoryOwnership implements CharacterOwnershipPort {
  public constructor(private readonly owned: ReadonlyMap<string, string>) {}
  public assertOwnedByActor(input: {
    readonly characterId: string;
    readonly v2UserId: string;
  }): Promise<void> {
    if (this.owned.get(input.characterId) !== input.v2UserId) {
      return Promise.reject(new PlayerWorkspaceError('FORBIDDEN', 'not owned'));
    }
    return Promise.resolve();
  }
}

/** Minimal in-memory repo for security rules — not production parity. */
class MemoryRepo implements PlayerWorkspaceRepository {
  private readonly teams = new Map<string, TeamRecord>();
  private readonly members = new Map<string, TeamMemberRecord>();
  private readonly invitations = new Map<string, TeamInvitationRecord>();
  private readonly boards = new Map<string, CharacterBoardRecord>();

  public constructor(private readonly ownership: CharacterOwnershipPort) {}

  public async createTeam(input: {
    readonly name: string;
    readonly actorUserId: string;
  }): Promise<TeamDetail> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const team: TeamRecord = {
      id,
      name: input.name,
      createdByUserId: input.actorUserId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.teams.set(id, team);
    this.members.set(`${id}:${input.actorUserId}`, {
      teamId: id,
      userId: input.actorUserId,
      role: 'OWNER',
      status: 'ACTIVE',
      joinedAt: now,
      removedAt: null,
    });
    return this.getTeamDetail(id, input.actorUserId);
  }

  public listTeamsForUser(userId: string): Promise<readonly TeamRecord[]> {
    return Promise.resolve(
      [...this.members.values()]
        .filter((m) => m.userId === userId && m.status === 'ACTIVE')
        .map((m) => this.teams.get(m.teamId)!)
        .filter(Boolean),
    );
  }

  public getActiveMember(teamId: string, userId: string): Promise<TeamMemberRecord | null> {
    return Promise.resolve(this.members.get(`${teamId}:${userId}`) ?? null);
  }

  public async getTeamDetail(teamId: string, actorUserId: string): Promise<TeamDetail> {
    const member = requireActiveMembership(await this.getActiveMember(teamId, actorUserId));
    const team = this.teams.get(teamId);
    if (team === undefined) throw new PlayerWorkspaceError('NOT_FOUND', 'Team not found');
    return {
      team,
      members: [...this.members.values()].filter(
        (m) => m.teamId === teamId && m.status === 'ACTIVE',
      ),
      invitations: [...this.invitations.values()].filter(
        (i) => i.teamId === teamId && i.status === 'PENDING',
      ),
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
    const member = requireActiveMembership(
      await this.getActiveMember(input.teamId, input.actorUserId),
    );
    requireOwner(member);
    const team = this.teams.get(input.teamId)!;
    if (team.revision !== input.expectedTeamRevision) {
      throw new PlayerWorkspaceError('CONFLICT', 'Team revision mismatch');
    }
    const invitation: TeamInvitationRecord = {
      id: randomUUID(),
      teamId: input.teamId,
      targetUserId: input.targetUserId,
      invitedByUserId: input.actorUserId,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      revision: 1,
      operationId: input.operationId,
    };
    this.invitations.set(invitation.id, invitation);
    this.teams.set(input.teamId, { ...team, revision: team.revision + 1 });
    return invitation;
  }

  public acceptInvitation(input: {
    readonly invitationId: string;
    readonly actorUserId: string;
    readonly expectedRevision: number;
    readonly operationId: string;
  }): Promise<TeamInvitationRecord> {
    const invitation = this.invitations.get(input.invitationId);
    if (invitation === undefined) {
      return Promise.reject(new PlayerWorkspaceError('NOT_FOUND', 'missing'));
    }
    if (invitation.targetUserId !== input.actorUserId) {
      return Promise.reject(new PlayerWorkspaceError('FORBIDDEN', 'not invitee'));
    }
    if (invitation.status === 'ACCEPTED') return Promise.resolve(invitation);
    if (invitation.status !== 'PENDING') {
      return Promise.reject(new PlayerWorkspaceError('CONFLICT', 'bad status'));
    }
    if (invitation.revision !== input.expectedRevision) {
      return Promise.reject(new PlayerWorkspaceError('CONFLICT', 'revision'));
    }
    const next = {
      ...invitation,
      status: 'ACCEPTED' as const,
      revision: invitation.revision + 1,
      resolvedAt: new Date().toISOString(),
    };
    this.invitations.set(invitation.id, next);
    this.members.set(`${invitation.teamId}:${input.actorUserId}`, {
      teamId: invitation.teamId,
      userId: input.actorUserId,
      role: 'MEMBER',
      status: 'ACTIVE',
      joinedAt: new Date().toISOString(),
      removedAt: null,
    });
    return Promise.resolve(next);
  }

  public rejectInvitation(): Promise<TeamInvitationRecord> {
    return Promise.reject(new Error('unused'));
  }
  public async revokeInvitation(input: {
    readonly invitationId: string;
    readonly actorUserId: string;
    readonly expectedRevision: number;
  }): Promise<TeamInvitationRecord> {
    const invitation = this.invitations.get(input.invitationId)!;
    const member = requireActiveMembership(
      await this.getActiveMember(invitation.teamId, input.actorUserId),
    );
    requireOwner(member);
    if (invitation.status !== 'PENDING') throw new PlayerWorkspaceError('CONFLICT', 'bad');
    const next = {
      ...invitation,
      status: 'REVOKED' as const,
      revision: invitation.revision + 1,
      resolvedAt: new Date().toISOString(),
    };
    this.invitations.set(invitation.id, next);
    return next;
  }

  public async removeMember(input: {
    readonly teamId: string;
    readonly actorUserId: string;
    readonly targetUserId: string;
    readonly expectedTeamRevision: number;
  }): Promise<TeamDetail> {
    const actor = requireActiveMembership(
      await this.getActiveMember(input.teamId, input.actorUserId),
    );
    const target = await this.getActiveMember(input.teamId, input.targetUserId);
    if (target === null) throw new PlayerWorkspaceError('NOT_FOUND', 'member');
    const owners = [...this.members.values()].filter(
      (m) => m.teamId === input.teamId && m.status === 'ACTIVE' && m.role === 'OWNER',
    ).length;
    assertCanRemoveMember({
      actorRole: actor.role,
      targetRole: target.role,
      activeOwnerCount: owners,
      targetUserId: input.targetUserId,
      actorUserId: input.actorUserId,
    });
    this.members.set(`${input.teamId}:${input.targetUserId}`, {
      ...target,
      status: 'REMOVED',
      removedAt: new Date().toISOString(),
    });
    return this.getTeamDetail(input.teamId, input.actorUserId);
  }

  public async listCharacterBoards(
    teamId: string,
    actorUserId: string,
  ): Promise<readonly CharacterBoardRecord[]> {
    requireActiveMembership(await this.getActiveMember(teamId, actorUserId));
    return [...this.boards.values()].filter((b) => b.teamId === teamId && b.archivedAt === null);
  }

  public async getCharacterBoard(
    teamId: string,
    boardId: string,
    actorUserId: string,
  ): Promise<CharacterBoardRecord> {
    requireActiveMembership(await this.getActiveMember(teamId, actorUserId));
    const board = this.boards.get(boardId);
    if (board === undefined || board.teamId !== teamId) {
      throw new PlayerWorkspaceError('NOT_FOUND', 'board');
    }
    return board;
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
    requireActiveMembership(await this.getActiveMember(input.teamId, input.actorUserId));
    if (input.linkedPlayerCharacterId !== null) {
      await this.ownership.assertOwnedByActor({
        characterId: input.linkedPlayerCharacterId,
        v2UserId: input.actorUserId,
      });
    }
    const team = this.teams.get(input.teamId)!;
    if (team.revision !== input.expectedTeamRevision) {
      throw new PlayerWorkspaceError('CONFLICT', 'team revision');
    }
    const board: CharacterBoardRecord = {
      id: randomUUID(),
      teamId: input.teamId,
      displayName: input.displayName,
      classSpecKey: input.classSpecKey,
      level: input.level,
      linkedPlayerCharacterId: input.linkedPlayerCharacterId,
      createdByUserId: input.actorUserId,
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    };
    this.boards.set(board.id, board);
    this.teams.set(input.teamId, { ...team, revision: team.revision + 1 });
    return { board, teamRevision: team.revision + 1 };
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
    requireActiveMembership(await this.getActiveMember(input.teamId, input.actorUserId));
    const board = this.boards.get(input.boardId);
    if (board === undefined) throw new PlayerWorkspaceError('NOT_FOUND', 'board');
    if (board.revision !== input.expectedBoardRevision) {
      throw new PlayerWorkspaceError('CONFLICT', 'board revision');
    }
    if (input.linkedPlayerCharacterId !== null) {
      await this.ownership.assertOwnedByActor({
        characterId: input.linkedPlayerCharacterId,
        v2UserId: input.actorUserId,
      });
    }
    const next = {
      ...board,
      displayName: input.displayName,
      classSpecKey: input.classSpecKey,
      level: input.level,
      linkedPlayerCharacterId: input.linkedPlayerCharacterId,
      revision: board.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    this.boards.set(board.id, next);
    return next;
  }
}

describe('player workspace security rules (memory)', () => {
  const ownedChar = randomUUID();
  const foreignChar = randomUUID();
  const ownership = new MemoryOwnership(
    new Map([
      [ownedChar, 'user-a'],
      [foreignChar, 'user-b'],
    ]),
  );

  it('blocks cross-team reads and membership management by members', async () => {
    const repo = new MemoryRepo(ownership);
    const teamA = await repo.createTeam({ name: 'A', actorUserId: 'user-a' });
    const teamB = await repo.createTeam({ name: 'B', actorUserId: 'user-b' });

    await expect(repo.getTeamDetail(teamB.team.id, 'user-a')).rejects.toThrow(/Team not found/);
    await expect(
      repo.createInvitation({
        teamId: teamA.team.id,
        actorUserId: 'user-a',
        targetUserId: 'user-c',
        expectedTeamRevision: teamA.team.revision,
        operationId: 'op-1',
      }),
    ).resolves.toBeTruthy();

    const invite = await repo.createInvitation({
      teamId: teamA.team.id,
      actorUserId: 'user-a',
      targetUserId: 'user-b',
      expectedTeamRevision: 2,
      operationId: 'op-2',
    });
    await repo.acceptInvitation({
      invitationId: invite.id,
      actorUserId: 'user-b',
      expectedRevision: 1,
      operationId: 'accept-1',
    });

    await expect(
      repo.createInvitation({
        teamId: teamA.team.id,
        actorUserId: 'user-b',
        targetUserId: 'user-c',
        expectedTeamRevision: 3,
        operationId: 'op-3',
      }),
    ).rejects.toThrow(PlayerWorkspaceError);

    await expect(
      repo.removeMember({
        teamId: teamA.team.id,
        actorUserId: 'user-b',
        targetUserId: 'user-a',
        expectedTeamRevision: 3,
      }),
    ).rejects.toThrow(PlayerWorkspaceError);
  });

  it('rejects invite accept by wrong user and foreign character link', async () => {
    const repo = new MemoryRepo(ownership);
    const team = await repo.createTeam({ name: 'A', actorUserId: 'user-a' });
    const invite = await repo.createInvitation({
      teamId: team.team.id,
      actorUserId: 'user-a',
      targetUserId: 'user-b',
      expectedTeamRevision: 1,
      operationId: 'inv',
    });
    await expect(
      repo.acceptInvitation({
        invitationId: invite.id,
        actorUserId: 'user-c',
        expectedRevision: 1,
        operationId: 'bad',
      }),
    ).rejects.toThrow(/not invitee/);

    await expect(
      repo.createCharacterBoard({
        teamId: team.team.id,
        actorUserId: 'user-a',
        expectedTeamRevision: 2,
        displayName: 'Hero',
        classSpecKey: 'warrior_body',
        level: null,
        linkedPlayerCharacterId: foreignChar,
        operationId: 'board-1',
      }),
    ).rejects.toThrow(/not owned/);

    await expect(
      repo.createCharacterBoard({
        teamId: team.team.id,
        actorUserId: 'user-a',
        expectedTeamRevision: 2,
        displayName: 'Hero',
        classSpecKey: 'warrior_body',
        level: null,
        linkedPlayerCharacterId: null,
        operationId: 'board-2',
      }),
    ).resolves.toMatchObject({ board: { linkedPlayerCharacterId: null } });
  });

  it('revoked invitation cannot be accepted and removed member loses access', async () => {
    const repo = new MemoryRepo(ownership);
    const team = await repo.createTeam({ name: 'A', actorUserId: 'user-a' });
    const invite = await repo.createInvitation({
      teamId: team.team.id,
      actorUserId: 'user-a',
      targetUserId: 'user-b',
      expectedTeamRevision: 1,
      operationId: 'inv',
    });
    await repo.revokeInvitation({
      invitationId: invite.id,
      actorUserId: 'user-a',
      expectedRevision: 1,
    });
    await expect(
      repo.acceptInvitation({
        invitationId: invite.id,
        actorUserId: 'user-b',
        expectedRevision: 2,
        operationId: 'accept',
      }),
    ).rejects.toThrow(/bad status/);

    const invite2 = await repo.createInvitation({
      teamId: team.team.id,
      actorUserId: 'user-a',
      targetUserId: 'user-b',
      expectedTeamRevision: 2,
      operationId: 'inv2',
    });
    await repo.acceptInvitation({
      invitationId: invite2.id,
      actorUserId: 'user-b',
      expectedRevision: 1,
      operationId: 'accept2',
    });
    await repo.removeMember({
      teamId: team.team.id,
      actorUserId: 'user-a',
      targetUserId: 'user-b',
      expectedTeamRevision: 3,
    });
    await expect(repo.getTeamDetail(team.team.id, 'user-b')).rejects.toThrow(/Team not found/);
  });
});
