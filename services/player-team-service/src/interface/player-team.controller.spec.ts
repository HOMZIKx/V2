import { describe, expect, it, vi } from 'vitest';

import { PlayerTeamStateUseCases } from '../application/use-cases/player-team-state.use-cases.js';
import { PlayerTeamError } from '../domain/errors.js';
import { PlayerTeamController } from './player-team.controller.js';

describe('PlayerTeamController', () => {
  it('returns revision conflict payload via exception filter contract', async () => {
    const useCases = {
      assertDemoAccess: vi.fn(() => 'viewer-1'),
      getViewerSnapshot: vi.fn(),
      upsertViewerSnapshot: vi.fn(() =>
        Promise.reject(new PlayerTeamError('REVISION_CONFLICT', 'conflict', { actualRevision: 7 })),
      ),
    } as unknown as PlayerTeamStateUseCases;

    const controller = new PlayerTeamController(useCases, {
      PLAYER_TEAM_DEMO_VIEWER_HEADER: 'x-demo-viewer-id',
    } as never);

    await expect(
      controller.putMyState(
        { 'x-demo-viewer-id': 'viewer-1' },
        { state: { workspaces: [] }, expectedRevision: 3 },
      ),
    ).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
      actualRevision: 7,
    });
  });
});
