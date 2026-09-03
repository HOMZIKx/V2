import type {
  CharacterBoardRecord,
  TeamInvitationRecord,
  TeamMemberRecord,
  TeamRecord,
} from '../../domain/models.js';

export type ActorSubject = {
  readonly v2UserId: string;
  readonly discordUserId?: string;
};

export interface CharacterOwnershipPort {
  assertOwnedByActor(input: {
    readonly characterId: string;
    readonly v2UserId: string;
  }): Promise<void>;
}

export type TeamDetail = {
  readonly team: TeamRecord;
  readonly members: readonly TeamMemberRecord[];
  readonly invitations: readonly TeamInvitationRecord[];
  readonly viewerRole: 'OWNER' | 'MEMBER';
};

export interface PlayerWorkspaceRepository {
  createTeam(input: { readonly name: string; readonly actorUserId: string }): Promise<TeamDetail>;

  listTeamsForUser(userId: string): Promise<readonly TeamRecord[]>;

  getTeamDetail(teamId: string, actorUserId: string): Promise<TeamDetail>;

  getActiveMember(teamId: string, userId: string): Promise<TeamMemberRecord | null>;

  createInvitation(input: {
    readonly teamId: string;
    readonly actorUserId: string;
    readonly targetUserId: string;
    readonly expectedTeamRevision: number;
    readonly operationId: string;
  }): Promise<TeamInvitationRecord>;

  acceptInvitation(input: {
    readonly invitationId: string;
    readonly actorUserId: string;
    readonly expectedRevision: number;
    readonly operationId: string;
  }): Promise<TeamInvitationRecord>;

  rejectInvitation(input: {
    readonly invitationId: string;
    readonly actorUserId: string;
    readonly expectedRevision: number;
  }): Promise<TeamInvitationRecord>;

  revokeInvitation(input: {
    readonly invitationId: string;
    readonly actorUserId: string;
    readonly expectedRevision: number;
  }): Promise<TeamInvitationRecord>;

  removeMember(input: {
    readonly teamId: string;
    readonly actorUserId: string;
    readonly targetUserId: string;
    readonly expectedTeamRevision: number;
  }): Promise<TeamDetail>;

  listCharacterBoards(
    teamId: string,
    actorUserId: string,
  ): Promise<readonly CharacterBoardRecord[]>;

  getCharacterBoard(
    teamId: string,
    boardId: string,
    actorUserId: string,
  ): Promise<CharacterBoardRecord>;

  createCharacterBoard(input: {
    readonly teamId: string;
    readonly actorUserId: string;
    readonly expectedTeamRevision: number;
    readonly displayName: string;
    readonly classSpecKey: string;
    readonly level: number | null;
    readonly linkedPlayerCharacterId: string | null;
    readonly operationId: string;
  }): Promise<{ readonly board: CharacterBoardRecord; readonly teamRevision: number }>;

  updateCharacterBoard(input: {
    readonly teamId: string;
    readonly boardId: string;
    readonly actorUserId: string;
    readonly expectedBoardRevision: number;
    readonly displayName: string;
    readonly classSpecKey: string;
    readonly level: number | null;
    readonly linkedPlayerCharacterId: string | null;
  }): Promise<CharacterBoardRecord>;

  listPendingInvitationsForUser(userId: string): Promise<
    readonly (TeamInvitationRecord & {
      readonly teamName: string;
    })[]
  >;
}
