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

function membersOf(state: Record<string, unknown>): Record<string, unknown>[] {
  return (Array.isArray(state.members) ? state.members : [])
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

function invitationsOf(state: Record<string, unknown>): Record<string, unknown>[] {
  return (Array.isArray(state.invitations) ? state.invitations : [])
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

function memberMatchesDiscord(member: Record<string, unknown>, discordId: string): boolean {
  return asString(member.discordAccountId) === discordId || asString(member.id) === discordId;
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

  public async listPendingInvitations(
    recipientDiscordId: string,
  ): Promise<readonly TeamInvitationRecord[]> {
    return this.repository.listPendingForRecipient(recipientDiscordId);
  }

  public async createInvitation(input: {
    readonly ownerDiscordId: string;
    readonly workspaceId: string;
    readonly recipientDiscordId: string;
    readonly recipientDisplayName: string;
  }): Promise<{
    readonly invitation: TeamInvitationRecord;
    readonly workspaceId: string;
    readonly workspace: Record<string, unknown>;
    readonly revision: number;
  }> {
    if (!/^\d{17,20}$/.test(input.recipientDiscordId)) {
      throw new PlayerTeamError('VALIDATION_FAILED', 'recipient Discord id is invalid');
    }
    if (input.recipientDiscordId === input.ownerDiscordId) {
      throw new PlayerTeamError('VALIDATION_FAILED', 'cannot invite yourself');
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.repository.getWorkspace(input.workspaceId);
      if (current === null) {
        throw new PlayerTeamError('NOT_FOUND', 'shared workspace is not initialised');
      }

      const members = membersOf(current.state);
      const owner = members.find((member) => memberMatchesDiscord(member, input.ownerDiscordId));
      if (owner === undefined || asString(owner.role) !== 'owner') {
        throw new PlayerTeamError('UNAUTHORIZED', 'only workspace owner can invite members');
      }
      if (members.some((member) => memberMatchesDiscord(member, input.recipientDiscordId))) {
        throw new PlayerTeamError('VALIDATION_FAILED', 'recipient is already a team member');
      }

      const existing = invitationsOf(current.state).find(
        (entry) =>
          asString(entry.recipientDiscordId) === input.recipientDiscordId &&
          asString(entry.status) === 'pending',
      );
      if (existing !== undefined) {
        const existingId = asString(existing.id);
        const parsed = existingId
          ? await this.repository.findForRecipient(existingId, input.recipientDiscordId)
          : null;
        if (parsed !== null) {
          return {
            invitation: parsed.invitation,
            workspaceId: current.workspaceId,
            workspace: current.state,
            revision: current.revision,
          };
        }
        throw new PlayerTeamError('VALIDATION_FAILED', 'pending invitation already exists');
      }

      const recipientDisplayName =
        input.recipientDisplayName.trim() || `Gracz ${input.recipientDiscordId.slice(-4)}`;
      const revision = nextStateRevision(current.state);
      const invitation: TeamInvitationRecord = {
        id: `inv-${randomUUID()}`,
        teamId: current.workspaceId,
        teamName: asString(current.state.name) || 'Zespół',
        inviterName: asString(owner.displayName) || 'Właściciel',
        recipientDiscordId: input.recipientDiscordId,
        recipientDisplayName,
        status: 'pending',
        createdLabel: 'przed chwilą',
        expiresLabel: 'za 3 dni',
        revision: 1,
      };
      const history = Array.isArray(current.state.history) ? current.state.history : [];
      const nextState: Record<string, unknown> = {
        ...current.state,
        revision,
        invitations: [invitation, ...invitationsOf(current.state)],
        history: [
          {
            id: `hist-${randomUUID()}`,
            teamId: current.workspaceId,
            actorId: asString(owner.id) || input.ownerDiscordId,
            actorName: invitation.inviterName,
            actorInitials: initials(invitation.inviterName),
            characterId: null,
            characterName: null,
            resource: 'member',
            title: `Wysłano zaproszenie: ${recipientDisplayName}`,
            detail: `Discord ID ${input.recipientDiscordId}`,
            occurredAtLabel: 'przed chwilą',
            revision,
          },
          ...history,
        ],
        updatedLabel: 'przed chwilą',
      };

      try {
        const updated = await this.repository.updateWorkspace({
          workspaceId: current.workspaceId,
          state: nextState,
          expectedRevision: current.revision,
          updatedByUserId: input.ownerDiscordId,
        });
        return {
          invitation,
          workspaceId: updated.workspaceId,
          workspace: updated.state,
          revision: updated.revision,
        };
      } catch (error) {
        if (
          error instanceof PlayerTeamError &&
          error.code === 'REVISION_CONFLICT' &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new PlayerTeamError('REVISION_CONFLICT', 'could not create invitation after retries');
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
    readonly recipientAppId?: string | null;
    readonly invitationId: string;
    readonly decision: 'accept' | 'decline';
  }): Promise<{
    readonly invitation: TeamInvitationRecord;
    readonly workspaceId: string;
    readonly workspace: Record<string, unknown>;
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
    const invitations = invitationsOf(found.state).map((entry) => {
      if (asString(entry.id) !== input.invitationId) return entry;
      return {
        ...entry,
        status: input.decision === 'accept' ? 'accepted' : 'declined',
        revision:
          typeof entry.revision === 'number' && Number.isFinite(entry.revision)
            ? Math.trunc(entry.revision) + 1
            : 1,
      };
    });

    const memberAppId = input.recipientAppId?.trim() || input.recipientDiscordId;
    const members = [...membersOf(found.state)];
    if (input.decision === 'accept') {
      const alreadyMember = members.some((member) =>
        memberMatchesDiscord(member, input.recipientDiscordId),
      );
      if (!alreadyMember) {
        members.push({
          id: memberAppId,
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
          actorId: memberAppId,
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
      workspace: updated.state,
      revision: updated.revision,
    };
  }
}
