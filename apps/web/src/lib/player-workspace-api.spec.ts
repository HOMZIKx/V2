import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from './api';
import { getApiBaseUrl } from './env';
import {
  acceptInvitation,
  createCharacterBoard,
  createTeam,
  createTeamInvitation,
  getCharacterBoard,
  getTeamDetail,
  listCharacterBoards,
  listTeams,
  PlayerWorkspaceConflictError,
  rejectInvitation,
  removeTeamMember,
  revokeInvitation,
  updateCharacterBoard,
} from './player-workspace-api';

const fetchMock = vi.fn();

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubFetch(): void {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://v2-api.example.test');
  vi.stubGlobal('fetch', fetchMock);
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe('player-workspace API client', () => {
  it('maps an empty team list without fixture fallback', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ teams: [] }));
    await expect(listTeams()).resolves.toEqual([]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/player-workspace/v1/teams');
  });

  it('creates a team via the API gateway path', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          team: {
            id: 'team-1',
            name: 'Alpha',
            createdByUserId: 'user-a',
            revision: 1,
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
        },
        201,
      ),
    );

    const detail = await createTeam('Alpha');
    expect(detail.team.id).toBe('team-1');
    expect(detail.viewerRole).toBe('OWNER');
    expect(detail.members[0]?.role).toBe('OWNER');
    const init = fetchMock.mock.calls[0]?.[1] as { method?: string; body?: string };
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'Alpha' }));
  });

  it('loads team detail for the requested team only', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        team: {
          id: 'team-1',
          name: 'Alpha',
          createdByUserId: 'user-a',
          revision: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        members: [],
        invitations: [],
        viewerRole: 'MEMBER',
      }),
    );

    const detail = await getTeamDetail('team-1');
    expect(detail.team.revision).toBe(2);
    expect(detail.viewerRole).toBe('MEMBER');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/player-workspace/v1/teams/team-1');
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('team-2');
  });

  it('maps unauthenticated team requests to 401 without fixture data', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'Missing session' } }, 401),
    );

    await expect(listTeams()).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 401,
    });
  });

  it('maps removed-member access to 403', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'FORBIDDEN', message: 'Not a member' } }, 403),
    );

    await expect(getTeamDetail('team-1')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
    });
  });

  it('does not leak a foreign team board into the current team URL', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'NOT_FOUND', message: 'Board not in team' } }, 404),
    );

    await expect(getCharacterBoard('team-1', 'board-from-team-2')).rejects.toBeInstanceOf(
      ApiClientError,
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/player-workspace/v1/teams/team-1/character-boards/board-from-team-2',
    );
  });

  it('retries create-board with the same operationId', async () => {
    stubFetch();
    const payload = {
      displayName: 'NerwNicht',
      classSpecKey: 'sura_weapon',
      level: 75,
      linkedPlayerCharacterId: null,
      expectedTeamRevision: 4,
      operationId: 'op-board-retry',
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'timeout' } }, 503))
      .mockResolvedValueOnce(
        jsonResponse({
          board: {
            id: 'board-1',
            teamId: 'team-1',
            displayName: 'NerwNicht',
            classSpecKey: 'sura_weapon',
            level: 75,
            linkedPlayerCharacterId: null,
            createdByUserId: 'user-a',
            revision: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            archivedAt: null,
          },
          teamRevision: 5,
        }),
      );

    await expect(createCharacterBoard('team-1', payload)).rejects.toMatchObject({ status: 503 });
    const retry = await createCharacterBoard('team-1', payload);
    expect(retry.board.id).toBe('board-1');
    const firstBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as {
      operationId: string;
    };
    const secondBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as { body: string }).body),
    ) as { operationId: string };
    expect(firstBody.operationId).toBe('op-board-retry');
    expect(secondBody.operationId).toBe('op-board-retry');
  });

  it('lists character boards for a team', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        boards: [
          {
            id: 'board-1',
            teamId: 'team-1',
            displayName: 'Alpha',
            classSpecKey: 'warrior_body',
            level: null,
            linkedPlayerCharacterId: null,
            createdByUserId: 'user-a',
            revision: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            archivedAt: null,
          },
        ],
      }),
    );

    const boards = await listCharacterBoards('team-1');
    expect(boards).toHaveLength(1);
    expect(boards[0]?.linkedPlayerCharacterId).toBeNull();
  });

  it('updates a board with expectedBoardRevision', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        board: {
          id: 'board-1',
          teamId: 'team-1',
          displayName: 'Updated',
          classSpecKey: 'ninja_blade',
          level: 80,
          linkedPlayerCharacterId: '11111111-1111-4111-8111-111111111111',
          createdByUserId: 'user-a',
          revision: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          archivedAt: null,
        },
      }),
    );

    const board = await updateCharacterBoard('team-1', 'board-1', {
      displayName: 'Updated',
      classSpecKey: 'ninja_blade',
      level: 80,
      linkedPlayerCharacterId: '11111111-1111-4111-8111-111111111111',
      expectedBoardRevision: 1,
    });
    expect(board.revision).toBe(2);
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as { body: string }).body)) as {
      expectedBoardRevision: number;
    };
    expect(body.expectedBoardRevision).toBe(1);
  });

  it('maps stale revision to conflict without silent overwrite', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'CONFLICT', message: 'stale revision' } }, 409),
    );

    await expect(
      updateCharacterBoard('team-1', 'board-1', {
        displayName: 'Updated',
        classSpecKey: 'ninja_blade',
        level: 80,
        linkedPlayerCharacterId: null,
        expectedBoardRevision: 1,
      }),
    ).rejects.toBeInstanceOf(PlayerWorkspaceConflictError);
  });

  it('rejects a foreign canonical character link as 403', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'FORBIDDEN', message: 'Character not owned' } }, 403),
    );

    await expect(
      createCharacterBoard('team-1', {
        displayName: 'Stolen',
        classSpecKey: 'warrior_body',
        level: null,
        linkedPlayerCharacterId: '22222222-2222-4222-8222-222222222222',
        expectedTeamRevision: 1,
        operationId: 'op-foreign',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('sends invite/accept/reject/revoke/remove through gateway paths', async () => {
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
              operationId: 'op-inv',
            },
          },
          201,
        ),
      )
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
      )
      .mockResolvedValueOnce(jsonResponse({}, 204));

    await createTeamInvitation('team-1', {
      targetUserId: 'user-b',
      expectedTeamRevision: 3,
      operationId: 'op-inv',
    });
    await acceptInvitation('inv-1', { expectedRevision: 1, operationId: 'op-accept' });
    await rejectInvitation('inv-2', 1);
    await revokeInvitation('inv-3', 1);
    await removeTeamMember('team-1', 'user-b', 4);

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/teams/team-1/invitations');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/invitations/inv-1/accept');
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('/invitations/inv-2/reject');
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain('/invitations/inv-3/revoke');
    expect(String(fetchMock.mock.calls[4]?.[0])).toContain('/teams/team-1/members/user-b');
    expect((fetchMock.mock.calls[4]?.[1] as { method?: string }).method).toBe('DELETE');
  });

  it('propagates 5xx without substituting fixture teams', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'boom' } }, 500));
    await expect(listTeams()).rejects.toMatchObject({ status: 500 });
  });
});

describe('production API origin', () => {
  it('does not fall back to localhost in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
    expect(getApiBaseUrl()).toBe('');
    expect(getApiBaseUrl()).not.toContain('127.0.0.1');
    expect(getApiBaseUrl()).not.toContain('localhost');
  });
});
