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
  /** Absolute timestamps are authoritative; labels are display-only compatibility fields. */
  readonly createdAtIso?: string;
  readonly expiresAtIso?: string;
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
  getWorkspace(workspaceId: string): Promise<TeamInvitationWorkspaceUpdate | null>;

  listPendingForRecipient(
    recipientDiscordId: string,
  ): Promise<readonly TeamInvitationRecord[]>;

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

  /**
   * Production implementation commits accepted shared membership and the recipient's
   * private viewer snapshot in one PostgreSQL transaction. Optional for lightweight
   * in-memory test repositories.
   */
  acceptInvitationAtomically?(input: {
    readonly workspaceId: string;
    readonly state: Record<string, unknown>;
    readonly expectedRevision: number;
    readonly updatedByUserId: string;
    readonly recipientDiscordId: string;
    readonly invitationId: string;
  }): Promise<TeamInvitationWorkspaceUpdate>;
}
