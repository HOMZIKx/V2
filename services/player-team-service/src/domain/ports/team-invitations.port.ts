export type TeamInvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';

export type TeamInvitationRecord = {
  readonly id: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly inviterName: string;
  readonly recipientDiscordId: string;
  readonly recipientDisplayName: string;
  readonly status: TeamInvitationStatus;
  readonly createdLabel: string;
  readonly expiresLabel: string;
  readonly revision: number;
};

export type TeamInvitationWorkspaceRecord = {
  readonly workspaceId: string;
  readonly state: Record<string, unknown>;
  readonly revision: number;
  readonly invitation: TeamInvitationRecord;
};

export type TeamInvitationWorkspaceUpdate = {
  readonly workspaceId: string;
  readonly state: Record<string, unknown>;
  readonly revision: number;
};

export interface TeamInvitationsRepositoryPort {
  findForRecipient(
    invitationId: string,
    recipientDiscordId: string,
  ): Promise<TeamInvitationWorkspaceRecord | null>;

  updateWorkspace(input: {
    readonly workspaceId: string;
    readonly state: Record<string, unknown>;
    readonly expectedRevision: number;
    readonly updatedByUserId: string;
  }): Promise<TeamInvitationWorkspaceUpdate>;
}
