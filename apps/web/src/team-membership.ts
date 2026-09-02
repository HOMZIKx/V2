export type WorkspaceConnectionState = 'connected' | 'reconnecting' | 'offline' | 'revoked';

export type TeamInvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';

export type TeamRole = 'owner' | 'member';

export interface DiscordIdentity {
  readonly discordUserId: string;
  readonly displayName: string;
  readonly username: string;
  readonly initials: string;
}

export interface TeamMembership {
  readonly id: string;
  readonly identity: DiscordIdentity;
  readonly role: TeamRole;
  readonly joinedLabel: string;
  readonly state: 'online' | 'away' | 'offline';
  readonly revision: number;
}

export interface TeamInvitation {
  readonly id: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly inviterName: string;
  readonly recipient: DiscordIdentity;
  readonly status: TeamInvitationStatus;
  readonly createdLabel: string;
  readonly expiresLabel: string;
  readonly revision: number;
  readonly operationId: string;
}

export interface TeamMembershipSnapshot {
  readonly viewerName: string;
  readonly viewerRole: TeamRole;
  readonly teamId: string;
  readonly teamName: string;
  readonly teamRevision: number;
  readonly connectionState: WorkspaceConnectionState;
  readonly members: readonly TeamMembership[];
  readonly invitations: readonly TeamInvitation[];
}

export interface ResolveDiscordIdentityResult {
  readonly ok: boolean;
  readonly identity: DiscordIdentity | null;
  readonly error: 'invalid_discord_id' | 'identity_not_found' | null;
}

export interface CreateTeamInvitationCommand {
  readonly teamId: string;
  readonly expectedTeamRevision: number;
  readonly recipient: DiscordIdentity;
  readonly operationId: string;
}

export interface RespondToTeamInvitationCommand {
  readonly invitationId: string;
  readonly expectedRevision: number;
  readonly decision: 'accept' | 'decline';
  readonly operationId: string;
}

export interface TeamMembershipAdapter {
  getTeamMembership(teamId: string): Promise<TeamMembershipSnapshot>;
  resolveDiscordIdentity(discordUserId: string): Promise<ResolveDiscordIdentityResult>;
  createInvitation(command: CreateTeamInvitationCommand): Promise<TeamInvitation>;
  respondToInvitation(command: RespondToTeamInvitationCommand): Promise<TeamInvitation>;
  cancelInvitation(
    invitationId: string,
    expectedRevision: number,
    operationId: string,
  ): Promise<TeamInvitation>;
}

export const discordDirectoryFixture: readonly DiscordIdentity[] = [
  {
    discordUserId: '994001220033445566',
    displayName: 'MobbynZS Oak',
    username: 'mobbynzs_oak',
    initials: 'MO',
  },
  {
    discordUserId: '771122334455667788',
    displayName: 'DarthEsion',
    username: 'darthesion',
    initials: 'DE',
  },
];

export const teamMembershipFixture: TeamMembershipSnapshot = {
  viewerName: 'Mateusz',
  viewerRole: 'owner',
  teamId: 'asteria',
  teamName: 'Asteria',
  teamRevision: 12,
  connectionState: 'connected',
  members: [
    {
      id: 'membership-mateusz',
      identity: {
        discordUserId: '111122223333444455',
        displayName: 'Mateusz',
        username: 'panapass3k',
        initials: 'M',
      },
      role: 'owner',
      joinedLabel: 'założyciel przestrzeni',
      state: 'online',
      revision: 4,
    },
    {
      id: 'membership-xiaohu',
      identity: {
        discordUserId: '222233334444555566',
        displayName: 'XiaoHu',
        username: 'xiaohu',
        initials: 'X',
      },
      role: 'member',
      joinedLabel: 'dołączył 28 sierpnia',
      state: 'online',
      revision: 2,
    },
    {
      id: 'membership-wicek',
      identity: {
        discordUserId: '333344445555666677',
        displayName: 'Wicek',
        username: 'wicek',
        initials: 'W',
      },
      role: 'member',
      joinedLabel: 'dołączył 29 sierpnia',
      state: 'away',
      revision: 1,
    },
  ],
  invitations: [
    {
      id: 'invitation-aalpsik',
      teamId: 'asteria',
      teamName: 'Asteria',
      inviterName: 'Mateusz',
      recipient: {
        discordUserId: '444455556666777788',
        displayName: 'Aalpsik',
        username: 'aalpsik',
        initials: 'A',
      },
      status: 'pending',
      createdLabel: 'dzisiaj 09:42',
      expiresLabel: 'za 6 dni',
      revision: 1,
      operationId: 'invite-aalpsik-1',
    },
  ],
};

export const incomingInvitationFixture: TeamInvitation = {
  id: 'invitation-mobbynzs',
  teamId: 'asteria',
  teamName: 'Asteria',
  inviterName: 'Mateusz',
  recipient: discordDirectoryFixture[0]!,
  status: 'pending',
  createdLabel: 'dzisiaj 11:28',
  expiresLabel: 'za 7 dni',
  revision: 1,
  operationId: 'invite-mobbynzs-1',
};

export function isDiscordUserId(value: string): boolean {
  return /^\d{17,20}$/.test(value.trim());
}

export function resolveDiscordIdentity(
  directory: readonly DiscordIdentity[],
  discordUserId: string,
): ResolveDiscordIdentityResult {
  const normalizedId = discordUserId.trim();
  if (!isDiscordUserId(normalizedId)) {
    return { ok: false, identity: null, error: 'invalid_discord_id' };
  }

  const identity = directory.find((candidate) => candidate.discordUserId === normalizedId) ?? null;
  return identity
    ? { ok: true, identity, error: null }
    : { ok: false, identity: null, error: 'identity_not_found' };
}

export function createPendingInvitation(
  invitations: readonly TeamInvitation[],
  input: Omit<TeamInvitation, 'id' | 'status' | 'revision'>,
): readonly TeamInvitation[] {
  const duplicate = invitations.find(
    (invitation) =>
      invitation.recipient.discordUserId === input.recipient.discordUserId &&
      invitation.status === 'pending',
  );
  if (duplicate) return invitations;

  return [
    ...invitations,
    {
      ...input,
      id: `invitation-${input.recipient.discordUserId}`,
      status: 'pending',
      revision: 1,
    },
  ];
}

export function respondToInvitation(
  invitation: TeamInvitation,
  decision: 'accept' | 'decline',
): TeamInvitation {
  if (invitation.status !== 'pending') return invitation;
  return {
    ...invitation,
    status: decision === 'accept' ? 'accepted' : 'declined',
    revision: invitation.revision + 1,
  };
}

export function cancelInvitation(invitation: TeamInvitation): TeamInvitation {
  if (invitation.status !== 'pending') return invitation;
  return { ...invitation, status: 'cancelled', revision: invitation.revision + 1 };
}

export function invitationStatusLabel(status: TeamInvitationStatus): string {
  const labels: Record<TeamInvitationStatus, string> = {
    pending: 'Oczekuje na akceptację',
    accepted: 'Zaakceptowane',
    declined: 'Odrzucone',
    expired: 'Wygasło',
    cancelled: 'Anulowane',
  };
  return labels[status];
}
