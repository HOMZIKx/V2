import { PlayerWorkspaceError } from './errors.js';
import type { TeamMemberRecord, TeamRole } from './models.js';

export function requireActiveMembership(member: TeamMemberRecord | null): TeamMemberRecord {
  if (member === null || member.status !== 'ACTIVE') {
    throw new PlayerWorkspaceError('NOT_FOUND', 'Team not found');
  }
  return member;
}

export function requireOwner(member: TeamMemberRecord): void {
  if (member.role !== 'OWNER') {
    throw new PlayerWorkspaceError('FORBIDDEN', 'Only team owners may manage membership');
  }
}

export function assertCanRemoveMember(params: {
  readonly actorRole: TeamRole;
  readonly targetRole: TeamRole;
  readonly activeOwnerCount: number;
  readonly targetUserId: string;
  readonly actorUserId: string;
}): void {
  if (params.actorRole !== 'OWNER') {
    throw new PlayerWorkspaceError('FORBIDDEN', 'Only team owners may remove members');
  }
  if (params.targetUserId === params.actorUserId) {
    throw new PlayerWorkspaceError(
      'VALIDATION_FAILED',
      'Owners cannot remove themselves in this slice',
    );
  }
  if (params.targetRole === 'OWNER' && params.activeOwnerCount <= 1) {
    throw new PlayerWorkspaceError('VALIDATION_FAILED', 'Cannot remove the sole team owner');
  }
}
