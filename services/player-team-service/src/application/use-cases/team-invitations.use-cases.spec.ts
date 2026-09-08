import { describe, expect, it, vi } from 'vitest';

import { TeamInvitationsUseCases } from './team-invitations.use-cases.js';
import { PlayerTeamError } from '../../domain/errors.js';
import type {
  TeamInvitationRecord,
  TeamInvitationsRepositoryPort,
  TeamInvitationWorkspaceUpdate,
} from '../../domain/ports/team-invitations.port.js';

const OWNER_ID = '111122223333444455';
const RECIPIENT_ID = '994001220033445566';

function baseWorkspace(): Record<string, unknown> {
  return {
    id: 'team-1',
    name: 'Destiled',
    revision: 1,
    members: [
      {
        id: 'owner-app-id',
        discordAccountId: OWNER_ID,
        displayName: 'Mateusz',
        initials: 'M',
        role: 'owner',
        state: 'unknown',
      },
    ],
    invitations: [],
    history: [],
  };
}

function parseInvitation(raw: unknown): TeamInvitationRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.id !== 'string' || typeof entry.recipientDiscordId !== 'string') return null;
  return {
    id: entry.id,
    teamId: String(entry.teamId),
    teamName: String(entry.teamName),
    inviterName: String(entry.inviterName),
    recipientDiscordId: entry.recipientDiscordId,
    recipientDisplayName: String(entry.recipientDisplayName),
    status: String(entry.status) as TeamInvitationRecord['status'],
    createdLabel: String(entry.createdLabel),
    expiresLabel: String(entry.expiresLabel),
    revision: Number(entry.revision),
  };
}

function repository(initialState = baseWorkspace()): TeamInvitationsRepositoryPort {
  let snapshot: TeamInvitationWorkspaceUpdate = {
    workspaceId: 'team-1',
    state: initialState,
    revision: 0,
  };

  return {
    getWorkspace: vi.fn(async (workspaceId: string) =>
      workspaceId === snapshot.workspaceId ? snapshot : null,
    ),
    listPendingForRecipient: vi.fn(async (recipientDiscordId: string) => {
      const invitations = Array.isArray(snapshot.state.invitations)
        ? snapshot.state.invitations
        : [];
      return invitations
        .map(parseInvitation)
        .filter(
          (entry): entry is TeamInvitationRecord =>
            entry !== null &&
            entry.recipientDiscordId === recipientDiscordId &&
            entry.status === 'pending',
        );
    }),
    findForRecipient: vi.fn(async (invitationId: string, recipientDiscordId: string) => {
      const invitations = Array.isArray(snapshot.state.invitations)
        ? snapshot.state.invitations
        : [];
      const invitation = invitations
        .map(parseInvitation)
        .find(
          (entry) =>
            entry !== null &&
            entry.id === invitationId &&
            entry.recipientDiscordId === recipientDiscordId,
        );
      if (!invitation) return null;
      return {
        workspaceId: snapshot.workspaceId,
        state: snapshot.state,
        revision: snapshot.revision,
        invitation,
      };
    }),
    updateWorkspace: vi.fn(async (input) => {
      if (input.expectedRevision !== snapshot.revision) {
        throw new PlayerTeamError('REVISION_CONFLICT');
      }
      snapshot = {
        workspaceId: input.workspaceId,
        state: input.state,
        revision: snapshot.revision + 1,
      };
      return snapshot;
    }),
  };
}

describe('TeamInvitationsUseCases', () => {
  it('creates a server invitation only for the shared workspace owner', async () => {
    const repo = repository();
    const useCases = new TeamInvitationsUseCases(repo, { allowDemoWrite: true });

    const result = await useCases.createInvitation({
      ownerDiscordId: OWNER_ID,
      workspaceId: 'team-1',
      recipientDiscordId: RECIPIENT_ID,
      recipientDisplayName: 'MobbynZS',
    });

    expect(result.invitation).toMatchObject({
      teamId: 'team-1',
      inviterName: 'Mateusz',
      recipientDiscordId: RECIPIENT_ID,
      status: 'pending',
    });
    expect((result.workspace.invitations as unknown[]).length).toBe(1);
  });

  it('rejects invitation creation by a non-owner', async () => {
    const state = baseWorkspace();
    state.members = [
      {
        id: 'member-app-id',
        discordAccountId: OWNER_ID,
        displayName: 'Member',
        role: 'member',
      },
    ];
    const useCases = new TeamInvitationsUseCases(repository(state), { allowDemoWrite: true });

    await expect(
      useCases.createInvitation({
        ownerDiscordId: OWNER_ID,
        workspaceId: 'team-1',
        recipientDiscordId: RECIPIENT_ID,
        recipientDisplayName: 'MobbynZS',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('lists only pending invitations addressed to the authenticated recipient', async () => {
    const repo = repository();
    const useCases = new TeamInvitationsUseCases(repo, { allowDemoWrite: true });
    const mine = await useCases.createInvitation({
      ownerDiscordId: OWNER_ID,
      workspaceId: 'team-1',
      recipientDiscordId: RECIPIENT_ID,
      recipientDisplayName: 'MobbynZS',
    });

    await expect(useCases.listPendingInvitations(RECIPIENT_ID)).resolves.toEqual([
      mine.invitation,
    ]);
    await expect(useCases.listPendingInvitations('777788889999000011')).resolves.toEqual([]);
  });

  it('accepts only the invitation addressed to the authenticated Discord account', async () => {
    const repo = repository();
    const useCases = new TeamInvitationsUseCases(repo, { allowDemoWrite: true });
    const created = await useCases.createInvitation({
      ownerDiscordId: OWNER_ID,
      workspaceId: 'team-1',
      recipientDiscordId: RECIPIENT_ID,
      recipientDisplayName: 'MobbynZS',
    });

    await expect(
      useCases.getInvitation('777788889999000011', created.invitation.id),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const accepted = await useCases.respond({
      recipientDiscordId: RECIPIENT_ID,
      recipientAppId: 'v2-user-recipient',
      invitationId: created.invitation.id,
      decision: 'accept',
    });
    const members = accepted.workspace.members as Array<Record<string, unknown>>;
    expect(
      members.some(
        (member) =>
          member.id === 'v2-user-recipient' && member.discordAccountId === RECIPIENT_ID,
      ),
    ).toBe(true);
    expect(accepted.invitation.status).toBe('accepted');
    await expect(useCases.listPendingInvitations(RECIPIENT_ID)).resolves.toEqual([]);
  });

  it('declining an invitation does not grant membership', async () => {
    const repo = repository();
    const useCases = new TeamInvitationsUseCases(repo, { allowDemoWrite: true });
    const created = await useCases.createInvitation({
      ownerDiscordId: OWNER_ID,
      workspaceId: 'team-1',
      recipientDiscordId: RECIPIENT_ID,
      recipientDisplayName: 'MobbynZS',
    });

    const declined = await useCases.respond({
      recipientDiscordId: RECIPIENT_ID,
      recipientAppId: 'v2-user-recipient',
      invitationId: created.invitation.id,
      decision: 'decline',
    });

    const members = declined.workspace.members as Array<Record<string, unknown>>;
    expect(members.some((member) => member.discordAccountId === RECIPIENT_ID)).toBe(false);
    expect(declined.invitation.status).toBe('declined');
  });
});
