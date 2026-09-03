import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlayerWorkspaceConflictError } from '../lib/player-workspace-api.js';
import { HttpTeamMembershipAdapter } from './http-team-membership-adapter.js';

const fetchMock = vi.fn();

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function stubFetch(): void {
  vi.stubGlobal('fetch', fetchMock);
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe('HttpTeamMembershipAdapter', () => {
  const adapter = new HttpTeamMembershipAdapter();

  it('maps list team detail to membership snapshot', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        team: {
          id: 'team-1',
          name: 'Alpha',
          createdByUserId: 'user-a',
          revision: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        members: [
          {
            teamId: 'team-1',
            userId: 'user-a',
            role: 'OWNER',
            status: 'ACTIVE',
            joinedAt: '2026-01-01T00:00:00.000Z',
            removedAt: null,
          },
        ],
        invitations: [],
        viewerRole: 'OWNER',
      }),
    );

    const snapshot = await adapter.getTeamMembership('team-1');
    expect(snapshot.teamId).toBe('team-1');
    expect(snapshot.teamName).toBe('Alpha');
    expect(snapshot.viewerRole).toBe('owner');
    expect(snapshot.members[0]?.role).toBe('owner');
  });

  it('creates invitation with resolved v2 user id', async () => {
    stubFetch();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          {
            invitation: {
              id: 'inv-1',
              teamId: 'team-1',
              targetUserId: 'user-b',
              invitedByUserId: 'user-a',
              status: 'PENDING',
              createdAt: '2026-01-02T00:00:00.000Z',
              resolvedAt: null,
              revision: 1,
              operationId: 'op-1',
            },
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          team: {
            id: 'team-1',
            name: 'Alpha',
            createdByUserId: 'user-a',
            revision: 4,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
          members: [],
          invitations: [],
          viewerRole: 'OWNER',
        }),
      );

    const invitation = await adapter.createInvitation({
      teamId: 'team-1',
      expectedTeamRevision: 3,
      operationId: 'op-1',
      recipient: {
        discordUserId: '994001220033445566',
        displayName: 'Test User',
        username: 'testuser',
        initials: 'TU',
        v2UserId: 'user-b',
      },
    });

    expect(invitation.status).toBe('pending');
    const init = fetchMock.mock.calls[0]?.[1] as { body?: string } | undefined;
    expect(String(init?.body)).toContain('user-b');
  });

  it('maps 409 conflict without fixture fallback', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'CONFLICT', message: 'Already invited' } }, 409),
    );

    await expect(
      adapter.createInvitation({
        teamId: 'team-1',
        expectedTeamRevision: 3,
        operationId: 'op-2',
        recipient: {
          discordUserId: '994001220033445566',
          displayName: 'Test User',
          username: 'testuser',
          initials: 'TU',
          v2UserId: 'user-b',
        },
      }),
    ).rejects.toBeInstanceOf(PlayerWorkspaceConflictError);
  });

  it('resolves discord identity via identity directory', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        entry: {
          v2UserId: 'user-b',
          discordUserId: '994001220033445566',
          displayName: 'Test User',
          username: 'testuser',
          initials: 'TU',
        },
      }),
    );

    const result = await adapter.resolveDiscordIdentity('994001220033445566');
    expect(result.ok).toBe(true);
    expect(result.identity?.v2UserId).toBe('user-b');
  });

  it('returns identity_not_found on 404 without fixture', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404),
    );

    const result = await adapter.resolveDiscordIdentity('994001220033445566');
    expect(result.error).toBe('identity_not_found');
  });

  it('maps MEMBER viewer role without observer', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        team: {
          id: 'team-1',
          name: 'Alpha',
          createdByUserId: 'user-a',
          revision: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        members: [
          {
            teamId: 'team-1',
            userId: 'user-b',
            role: 'MEMBER',
            status: 'ACTIVE',
            joinedAt: '2026-01-01T00:00:00.000Z',
            removedAt: null,
          },
        ],
        invitations: [],
        viewerRole: 'MEMBER',
      }),
    );

    const snapshot = await adapter.getTeamMembership('team-1');
    expect(snapshot.viewerRole).toBe('member');
    expect(snapshot.members[0]?.role).toBe('member');
  });

  it('accepts, rejects and revokes invitations through real API calls', async () => {
    stubFetch();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          invitation: {
            id: 'inv-1',
            teamId: 'team-1',
            targetUserId: 'user-b',
            invitedByUserId: 'user-a',
            status: 'ACCEPTED',
            createdAt: '2026-01-02T00:00:00.000Z',
            resolvedAt: '2026-01-03T00:00:00.000Z',
            revision: 2,
            operationId: 'op-accept',
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ invitations: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          invitation: {
            id: 'inv-2',
            teamId: 'team-1',
            targetUserId: 'user-c',
            invitedByUserId: 'user-a',
            status: 'REJECTED',
            createdAt: '2026-01-02T00:00:00.000Z',
            resolvedAt: '2026-01-03T00:00:00.000Z',
            revision: 2,
            operationId: null,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ invitations: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          invitation: {
            id: 'inv-3',
            teamId: 'team-1',
            targetUserId: 'user-d',
            invitedByUserId: 'user-a',
            status: 'REVOKED',
            createdAt: '2026-01-02T00:00:00.000Z',
            resolvedAt: '2026-01-03T00:00:00.000Z',
            revision: 2,
            operationId: null,
          },
        }),
      );

    await expect(
      adapter.respondToInvitation({
        invitationId: 'inv-1',
        decision: 'accept',
        expectedRevision: 1,
        operationId: 'op-accept',
      }),
    ).resolves.toMatchObject({ status: 'accepted' });
    await expect(
      adapter.respondToInvitation({
        invitationId: 'inv-2',
        decision: 'decline',
        expectedRevision: 1,
        operationId: 'op-reject',
      }),
    ).resolves.toMatchObject({ status: 'declined' });
    await expect(adapter.cancelInvitation('inv-3', 1, 'op-revoke')).resolves.toMatchObject({
      status: 'cancelled',
    });
  });

  it('removes a member and then fail-closes the team route', async () => {
    stubFetch();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 204))
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'FORBIDDEN', message: 'Not a member' } }, 403),
      );

    await adapter.removeMember('team-1', 'user-b', 4);
    await expect(adapter.getTeamMembership('team-1')).rejects.toMatchObject({ status: 403 });
  });

  it('refuses invite without a resolved v2 user id', async () => {
    await expect(
      adapter.createInvitation({
        teamId: 'team-1',
        expectedTeamRevision: 3,
        operationId: 'op-2',
        recipient: {
          discordUserId: '994001220033445566',
          displayName: 'Test User',
          username: 'testuser',
          initials: 'TU',
        },
      }),
    ).rejects.toThrow(/v2UserId/);
  });
});
