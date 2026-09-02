export type TeamRole = 'OWNER' | 'MEMBER';
export type MemberStatus = 'ACTIVE' | 'REMOVED';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'REVOKED';

export type TeamRecord = {
  readonly id: string;
  readonly name: string;
  readonly createdByUserId: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type TeamMemberRecord = {
  readonly teamId: string;
  readonly userId: string;
  readonly role: TeamRole;
  readonly status: MemberStatus;
  readonly joinedAt: string;
  readonly removedAt: string | null;
};

export type TeamInvitationRecord = {
  readonly id: string;
  readonly teamId: string;
  readonly targetUserId: string;
  readonly invitedByUserId: string;
  readonly status: InvitationStatus;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
  readonly revision: number;
  readonly operationId: string | null;
};

export type CharacterBoardRecord = {
  readonly id: string;
  readonly teamId: string;
  readonly displayName: string;
  readonly classSpecKey: string;
  readonly level: number | null;
  readonly linkedPlayerCharacterId: string | null;
  readonly createdByUserId: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
};
