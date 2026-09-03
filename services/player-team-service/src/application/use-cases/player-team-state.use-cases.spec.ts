import { describe, expect, it, vi } from 'vitest';

import { PlayerTeamStateUseCases } from '../../application/use-cases/player-team-state.use-cases.js';
import { PlayerTeamError } from '../../domain/errors.js';
import {
  type PlayerTeamStateRepositoryPort,
  type ViewerSnapshotRecord,
} from '../../domain/ports/player-team-state.port.js';

function createRepository(
  overrides: Partial<PlayerTeamStateRepositoryPort> = {},
): PlayerTeamStateRepositoryPort {
  return {
    getViewerSnapshot: vi.fn(() => Promise.resolve(null)),
    upsertViewerSnapshot: vi.fn(() => Promise.resolve({ revision: 1 })),
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
});
