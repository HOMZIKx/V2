import { describe, expect, it, vi } from 'vitest';

import { PlayerTeamStateUseCases } from '../../application/use-cases/player-team-state.use-cases.js';
import { PlayerTeamError } from '../../domain/errors.js';
import {
  type PlayerTeamStateRepositoryPort,
  type ViewerSnapshotRecord,
  type WorkspaceSnapshotRecord,
} from '../../domain/ports/player-team-state.port.js';

function createRepository(
  overrides: Partial<PlayerTeamStateRepositoryPort> = {},
): PlayerTeamStateRepositoryPort {
  return {
    getViewerSnapshot: vi.fn(() => Promise.resolve(null)),
    upsertViewerSnapshot: vi.fn(() => Promise.resolve({ revision: 1 })),
    getWorkspaceSnapshot: vi.fn(() => Promise.resolve(null)),
    upsertWorkspaceSnapshot: vi.fn((input) =>
      Promise.resolve({
        workspaceId: input.workspaceId,
        state: input.state,
        revision: 0,
        updatedByUserId: input.updatedByUserId,
        updatedAtIso: '2026-09-07T18:00:00.000Z',
      }),
    ),
    pingDatabase: vi.fn(() => Promise.resolve(true)),
    isMigrationApplied: vi.fn(() => Promise.resolve(true)),
    ...overrides,
  };
}

describe('PlayerTeamStateUseCases', () => {
  it('rejects missing demo header', () => {
    const useCases = new PlayerTeamStateUseCases(createRepository(), { allowDemoWrite: true });

    expect(() => useCases.assertDemoAccess(undefined)).toThrow(PlayerTeamError);
    expect(() => useCases.assertDemoAccess('   ')).toThrow(PlayerTeamError);
  });

  it('rejects demo access when disabled', () => {
    const useCases = new PlayerTeamStateUseCases(createRepository(), { allowDemoWrite: false });

    expect(() => useCases.assertDemoAccess('viewer-1')).toThrow(PlayerTeamError);
  });

  it('returns trimmed demo viewer id', () => {
    const useCases = new PlayerTeamStateUseCases(createRepository(), { allowDemoWrite: true });

    expect(useCases.assertDemoAccess('  mateusz  ')).toBe('mateusz');
  });

  it('strips discord: prefix to bare snowflake', () => {
    const useCases = new PlayerTeamStateUseCases(createRepository(), { allowDemoWrite: true });

    expect(useCases.assertDemoAccess('discord:808066932753563668')).toBe('808066932753563668');
    expect(useCases.assertDemoAccess('808066932753563668')).toBe('808066932753563668');
  });

  it('throws NOT_FOUND when snapshot is missing', async () => {
    const useCases = new PlayerTeamStateUseCases(createRepository(), { allowDemoWrite: true });

    await expect(useCases.getViewerSnapshotOrThrow('viewer-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('returns snapshot from repository', async () => {
    const record: ViewerSnapshotRecord = {
      ownerUserId: 'viewer-1',
      state: { workspaces: [] },
      revision: 2,
      updatedAtIso: '2026-09-03T00:00:00.000Z',
    };
    const useCases = new PlayerTeamStateUseCases(
      createRepository({
        getViewerSnapshot: vi.fn(() => Promise.resolve(record)),
      }),
      { allowDemoWrite: true },
    );

    await expect(useCases.getViewerSnapshot('viewer-1')).resolves.toEqual(record);
  });

  it('bootstraps a shared workspace from the authenticated owner snapshot', async () => {
    const discordId = '808066932753563668';
    const workspace = {
      id: 'destiled-main',
      archived: false,
      members: [
        {
          id: 'viewer-app-id',
          discordAccountId: discordId,
          role: 'owner',
        },
      ],
      invitations: [],
    };
    const viewerRecord: ViewerSnapshotRecord = {
      ownerUserId: discordId,
      state: {
        viewer: { id: 'viewer-app-id', discordAccountId: discordId },
        workspaces: [workspace],
      },
      revision: 3,
      updatedAtIso: '2026-09-07T18:00:00.000Z',
    };
    const created: WorkspaceSnapshotRecord = {
      workspaceId: 'destiled-main',
      state: workspace,
      revision: 0,
      updatedByUserId: discordId,
      updatedAtIso: '2026-09-07T18:00:01.000Z',
    };
    const upsertWorkspaceSnapshot = vi.fn(() => Promise.resolve(created));
    const useCases = new PlayerTeamStateUseCases(
      createRepository({
        getViewerSnapshot: vi.fn(() => Promise.resolve(viewerRecord)),
        getWorkspaceSnapshot: vi.fn(() => Promise.resolve(null)),
        upsertWorkspaceSnapshot,
      }),
      { allowDemoWrite: true },
    );

    await expect(useCases.getWorkspaceSnapshot(discordId, 'destiled-main')).resolves.toEqual(created);
    expect(upsertWorkspaceSnapshot).toHaveBeenCalledWith({
      workspaceId: 'destiled-main',
      state: workspace,
      expectedRevision: null,
      updatedByUserId: discordId,
    });
  });
});
