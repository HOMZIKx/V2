import { afterEach, describe, expect, it, vi } from 'vitest';

import { toClassSpecKey } from '../lib/class-spec-adapter.js';
import { HttpCharacterProfileAdapter } from './http-character-profile-adapter.js';

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

describe('HttpCharacterProfileAdapter', () => {
  const adapter = new HttpCharacterProfileAdapter();

  it('maps class presentation to classSpecKey on create', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
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
        },
        201,
      ),
    );

    const result = await adapter.saveProfile({
      teamId: 'team-1',
      characterId: null,
      expectedTeamRevision: 4,
      expectedCharacterRevision: null,
      operationId: 'op-board-1',
      profile: {
        name: 'NerwNicht',
        characterClass: 'sura',
        gender: 'male',
        level: 75,
        responsibleMemberId: '',
        startingSetName: '',
        teamNote: '',
      },
    });

    expect(result.characterId).toBe('board-1');
    expect(toClassSpecKey('sura', 'male')).toBe('sura_weapon');
    const init = fetchMock.mock.calls[0]?.[1] as { body?: string } | undefined;
    const body = JSON.parse(String(init?.body)) as {
      classSpecKey: string;
      linkedPlayerCharacterId: null;
    };
    expect(body.classSpecKey).toBe('sura_weapon');
    expect(body.linkedPlayerCharacterId).toBeNull();
  });

  it('updates existing board with expected revision', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        board: {
          id: 'board-1',
          teamId: 'team-1',
          displayName: 'Updated',
          classSpecKey: 'ninja_blade',
          level: 80,
          linkedPlayerCharacterId: null,
          createdByUserId: 'user-a',
          revision: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          archivedAt: null,
        },
      }),
    );

    const result = await adapter.saveProfile({
      teamId: 'team-1',
      characterId: 'board-1',
      expectedTeamRevision: 5,
      expectedCharacterRevision: 1,
      operationId: 'op-board-2',
      profile: {
        name: 'Updated',
        characterClass: 'ninja',
        gender: 'male',
        level: 80,
        responsibleMemberId: '',
        startingSetName: '',
        teamNote: '',
      },
    });

    expect(result.characterRevision).toBe(2);
    const init = fetchMock.mock.calls[0]?.[1] as { body?: string } | undefined;
    const body = JSON.parse(String(init?.body)) as {
      expectedBoardRevision: number;
    };
    expect(body.expectedBoardRevision).toBe(1);
  });

  it('links an owned canonical character uuid', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          board: {
            id: 'board-2',
            teamId: 'team-1',
            displayName: 'Owned',
            classSpecKey: 'warrior_body',
            level: null,
            linkedPlayerCharacterId: '11111111-1111-4111-8111-111111111111',
            createdByUserId: 'user-a',
            revision: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            archivedAt: null,
          },
          teamRevision: 6,
        },
        201,
      ),
    );

    const result = await adapter.saveProfile({
      teamId: 'team-1',
      characterId: null,
      expectedTeamRevision: 5,
      expectedCharacterRevision: null,
      operationId: 'op-link',
      profile: {
        name: 'Owned',
        characterClass: 'warrior',
        gender: 'male',
        level: null,
        responsibleMemberId: '',
        startingSetName: '',
        teamNote: '',
        linkedPlayerCharacterId: '11111111-1111-4111-8111-111111111111',
      },
    });

    expect(result.characterId).toBe('board-2');
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as { body: string }).body)) as {
      linkedPlayerCharacterId: string;
    };
    expect(body.linkedPlayerCharacterId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('surfaces stale revision as conflict', async () => {
    stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'CONFLICT', message: 'stale' } }, 409),
    );

    await expect(
      adapter.saveProfile({
        teamId: 'team-1',
        characterId: 'board-1',
        expectedTeamRevision: 5,
        expectedCharacterRevision: 1,
        operationId: 'op-stale',
        profile: {
          name: 'Updated',
          characterClass: 'ninja',
          gender: 'male',
          level: 80,
          responsibleMemberId: '',
          startingSetName: '',
          teamNote: '',
        },
      }),
    ).rejects.toMatchObject({ name: 'PlayerWorkspaceConflictError' });
  });
});
