import { randomUUID } from 'node:crypto';

import { PlayerTeamError } from '../../domain/errors.js';
import {
  type TeamInvitationRecord,
  type TeamInvitationsRepositoryPort,
} from '../../domain/ports/team-invitations.port.js';

export type TeamInvitationsAccessConfig = {
  readonly allowDemoWrite: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

function nextStateRevision(state: Record<string, unknown>): number {
  return typeof state.revision === 'number' && Number.isFinite(state.revision)
    ? Math.max(0, Math.trunc(state.revision)) + 1
    : 1;
}

export class TeamInvitationsUseCases {
  public constructor(
    private readonly repository: TeamInvitationsRepositoryPort,
    private readonly access: TeamInvitationsAccessConfig,
  ) {}

  public assertAccess(headerValue: string | undefined): string {
    if (!this.access.allowDemoWrite) {
      throw new PlayerTeamError(
        'DEMO_ACCESS_DENIED',
        'player-team invitation compatibility access is not enabled',
      );
    }
    const viewerId = headerValue?.trim() ?? '';
    if (!/^\d{17,20}$/.test(viewerId)) {
      throw new PlayerTeamError('UNAUTHORIZED', 'authenticated Discord identity required');
    }
    return viewerId;
  }

  public async getInvitation(
    recipientDiscordId: string,
    invitationId: string,
  ): Promise<TeamInvitationRecord> {
    const found = await this.repository.findForRecipient(invitationId, recipientDiscordId);
    if (found === null) {
      throw new PlayerTeamError('NOT_FOUND', 'team invitation not found');
    }
    return found.invitation;
  }

  public async respond(input: {
    readonly recipientDiscordId: string;
    readonly invitationId: string;
    readonly decision: 'accept' | 'decline';
  }): Promise<{
    readonly invitation: TeamInvitationRecord;
    readonly workspaceId: string;
    readonly workspace: Record<string, unknown> | null;
    readonly revision: number;
  }> {
    const found = await this.repository.findForRecipient(
      input.invitationId,
      input.recipientDiscordId,
    );
    if (found === null) {
      throw new PlayerTeamError('NOT_FOUND', 'team invitation not found');
    }
    if (found.invitation.status !== 'pending') {
      throw new PlayerTeamError('VALIDATION_FAILED', 'team invitation is no longer pending');
    }

    const revision = nextStateRevision(found.state);
    const invitations = (Array.isArray(found.state.invitations) ? found.state.invitations : []).map(
      (raw) => {
        const entry = asRecord(raw);
        if (entry === null || asString(entry.id) !== input.invitationId) return raw;
        return {
          ...entry,
          status: input.decision === 'accept' ? 'accepted' : 'declined',
          revision:
            typeof entry.revision === 'number' && Number.isFinite(entry.revision)
              ? Math.trunc(entry.revision) + 1
              : 1,
        };
      },
    );

    const members = Array.isArray(found.state.members) ? [...found.state.members] : [];
    if (input.decision === 'accept') {
      const alreadyMember = members.some((raw) => {
        const member = asRecord(raw);
        if (member === null) return false;
        return (
          asString(member.discordAccountId) === input.recipientDiscordId ||
          asString(member.id) === input.recipientDiscordId
        );
      });
      if (!alreadyMember) {
        members.push({
          id: input.recipientDiscordId,
          discordAccountId: input.recipientDiscordId,
          displayName: found.invitation.recipientDisplayName || input.recipientDiscordId,
          initials: initials(found.invitation.recipientDisplayName || '?'),
          role: 'member',
          state: 'unknown',
        });
      }
    }

    const history = Array.isArray(found.state.history) ? found.state.history : [];
    const nextState: Record<string, unknown> = {
      ...found.state,
      revision,
      invitations,
      ...(input.decision === 'accept' ? { members } : {}),
      history: [
        {
          id: `hist-${randomUUID()}`,
          teamId: found.workspaceId,
          actorId: input.recipientDiscordId,
          actorName: found.invitation.recipientDisplayName || input.recipientDiscordId,
          actorInitials: initials(found.invitation.recipientDisplayName || '?'),
          characterId: null,
          characterName: null,
          resource: 'member',
          title:
            input.decision === 'accept'
              ? 'Zaproszenie zaakceptowane'
              : 'Zaproszenie odrzucone',
          detail: found.invitation.recipientDisplayName || input.recipientDiscordId,
          occurredAtLabel: 'przed chwilą',
          revision,
        },
        ...history,
      ],
      updatedLabel: 'przed chwilą',
    };

    const updated = await this.repository.updateWorkspace({
      workspaceId: found.workspaceId,
      state: nextState,
      expectedRevision: found.revision,
      updatedByUserId: input.recipientDiscordId,
    });

    const updatedInvitation = {
      ...found.invitation,
      status: input.decision === 'accept' ? ('accepted' as const) : ('declined' as const),
      revision: found.invitation.revision + 1,
    };

    return {
      invitation: updatedInvitation,
      workspaceId: updated.workspaceId,
      workspace: input.decision === 'accept' ? updated.state : null,
      revision: updated.revision,
    };
  }
}
