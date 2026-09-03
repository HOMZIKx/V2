import { ApiClientError } from '../lib/api';
import {
  acceptInvitation as apiAcceptInvitation,
  createTeamInvitation as apiCreateInvitation,
  rejectInvitation as apiRejectInvitation,
  removeTeamMember as apiRemoveTeamMember,
  revokeInvitation as apiRevokeInvitation,
  getTeamDetail,
  listPendingInvitations,
  PlayerWorkspaceConflictError,
  resolveDiscordDirectory,
  type TeamInvitationRecordDto,
  type TeamMemberRecordDto,
} from '../lib/player-workspace-api';
import {
  isDiscordUserId,
  type CreateTeamInvitationCommand,
  type DiscordIdentity,
  type ResolveDiscordIdentityResult,
  type RespondToTeamInvitationCommand,
  type TeamInvitation,
  type TeamInvitationStatus,
  type TeamMembership,
  type TeamMembershipAdapter,
  type TeamMembershipSnapshot,
  type TeamRole,
} from '../team-membership';

function mapRole(role: 'OWNER' | 'MEMBER'): TeamRole {
  return role === 'OWNER' ? 'owner' : 'member';
}

function mapInvitationStatus(status: TeamInvitationRecordDto['status']): TeamInvitationStatus {
  const map: Record<TeamInvitationRecordDto['status'], TeamInvitationStatus> = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    REJECTED: 'declined',
    REVOKED: 'cancelled',
  };
  return map[status];
}

function formatJoinedLabel(joinedAt: string, role: TeamRole): string {
  if (role === 'owner') return 'założyciel przestrzeni';
  try {
    const date = new Date(joinedAt);
    return `dołączył ${date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}`;
  } catch {
    return 'członek zespołu';
  }
}

function formatCreatedLabel(createdAt: string): string {
  try {
    const date = new Date(createdAt);
    const now = new Date();
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    if (sameDay) {
      return `dzisiaj ${date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });
  } catch {
    return createdAt;
  }
}

function formatExpiresLabel(createdAt: string): string {
  try {
    const expires = new Date(createdAt);
    expires.setDate(expires.getDate() + 7);
    const now = new Date();
    const daysLeft = Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / 86_400_000));
    return daysLeft <= 0 ? 'wygasa dziś' : `za ${daysLeft} dni`;
  } catch {
    return 'za 7 dni';
  }
}

function userIdentityFromUserId(userId: string): DiscordIdentity {
  const short = userId.slice(0, 8);
  return {
    discordUserId: userId,
    displayName: `Użytkownik ${short}`,
    username: short,
    initials: short.slice(0, 2).toUpperCase(),
    v2UserId: userId,
  };
}

function mapMember(member: TeamMemberRecordDto): TeamMembership {
  return {
    id: member.userId,
    identity: userIdentityFromUserId(member.userId),
    role: mapRole(member.role),
    joinedLabel: formatJoinedLabel(member.joinedAt, mapRole(member.role)),
    state: 'offline',
    revision: 1,
  };
}

function mapInvitation(
  invitation: TeamInvitationRecordDto,
  teamName: string,
  inviterName: string,
  recipient?: DiscordIdentity,
): TeamInvitation {
  return {
    id: invitation.id,
    teamId: invitation.teamId,
    teamName,
    inviterName,
    recipient: recipient ?? userIdentityFromUserId(invitation.targetUserId),
    status: mapInvitationStatus(invitation.status),
    createdLabel: formatCreatedLabel(invitation.createdAt),
    expiresLabel: formatExpiresLabel(invitation.createdAt),
    revision: invitation.revision,
    operationId: invitation.operationId ?? '',
  };
}

export class HttpTeamMembershipAdapter implements TeamMembershipAdapter {
  public async getTeamMembership(teamId: string): Promise<TeamMembershipSnapshot> {
    const detail = await getTeamDetail(teamId);
    const viewerMember = detail.members.find((m) => m.role === detail.viewerRole);
    const viewerName =
      viewerMember !== undefined
        ? userIdentityFromUserId(viewerMember.userId).displayName
        : detail.team.name;

    return {
      viewerName,
      viewerRole: mapRole(detail.viewerRole),
      teamId: detail.team.id,
      teamName: detail.team.name,
      teamRevision: detail.team.revision,
      connectionState: 'connected',
      members: detail.members.map(mapMember),
      invitations: detail.invitations.map((invitation) =>
        mapInvitation(invitation, detail.team.name, viewerName),
      ),
    };
  }

  public async resolveDiscordIdentity(
    discordUserId: string,
  ): Promise<ResolveDiscordIdentityResult> {
    const normalizedId = discordUserId.trim();
    if (!isDiscordUserId(normalizedId)) {
      return { ok: false, identity: null, error: 'invalid_discord_id' };
    }

    try {
      const entry = await resolveDiscordDirectory(normalizedId);
      return {
        ok: true,
        identity: {
          discordUserId: entry.discordUserId,
          displayName: entry.displayName,
          username: entry.username,
          initials: entry.initials,
          v2UserId: entry.v2UserId,
        },
        error: null,
      };
    } catch (error) {
      if (error instanceof ApiClientError && error.isNotFound) {
        return { ok: false, identity: null, error: 'identity_not_found' };
      }
      throw error;
    }
  }

  public async createInvitation(command: CreateTeamInvitationCommand): Promise<TeamInvitation> {
    const targetUserId = command.recipient.v2UserId;
    if (targetUserId === undefined || targetUserId.trim().length === 0) {
      throw new Error('Recipient v2UserId is required for invitation');
    }

    try {
      const invitation = await apiCreateInvitation(command.teamId, {
        targetUserId,
        expectedTeamRevision: command.expectedTeamRevision,
        operationId: command.operationId,
      });
      const detail = await getTeamDetail(command.teamId);
      return mapInvitation(invitation, detail.team.name, detail.team.name, command.recipient);
    } catch (error) {
      if (error instanceof PlayerWorkspaceConflictError) {
        throw error;
      }
      throw error;
    }
  }

  public async respondToInvitation(
    command: RespondToTeamInvitationCommand,
  ): Promise<TeamInvitation> {
    const invitation =
      command.decision === 'accept'
        ? await apiAcceptInvitation(command.invitationId, {
            expectedRevision: command.expectedRevision,
            operationId: command.operationId,
          })
        : await apiRejectInvitation(command.invitationId, command.expectedRevision);

    const pending = await listPendingInvitations().catch(() => []);
    const meta = pending.find((item) => item.id === invitation.id);
    const teamName = meta?.teamName ?? invitation.teamId;

    return mapInvitation(invitation, teamName, 'Zespół');
  }

  public async cancelInvitation(
    invitationId: string,
    expectedRevision: number,
    operationId: string,
  ): Promise<TeamInvitation> {
    void operationId;
    const invitation = await apiRevokeInvitation(invitationId, expectedRevision);
    return mapInvitation(invitation, invitation.teamId, 'Ty');
  }

  public async removeMember(
    teamId: string,
    userId: string,
    expectedTeamRevision: number,
  ): Promise<void> {
    await apiRemoveTeamMember(teamId, userId, expectedTeamRevision);
  }
}

export async function loadPendingInvitationById(
  invitationId: string,
): Promise<TeamInvitation | null> {
  const pending = await listPendingInvitations();
  const match = pending.find((item) => item.id === invitationId);
  if (match === undefined) return null;
  return mapInvitation(match, match.teamName, 'Zespół', userIdentityFromUserId(match.targetUserId));
}
