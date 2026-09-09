import { describe, expect, it, vi } from 'vitest';

import { PlayerTeamStateUseCases } from '../application/use-cases/player-team-state.use-cases.js';
import { DiscordGatewayPlayerTeamReadController } from './discord-gateway-read.controller.js';

const DISCORD_ID = '123456789012345678';
const SECRET = 'test-discord-gateway-secret-123456';

function createController(overrides: Partial<PlayerTeamStateUseCases> = {}) {
  const useCases = {
    getWorkspaceSnapshot: vi.fn(() =>
      Promise.resolve({
        workspaceId: 'team-1',
        state: { id: 'team-1', name: 'Destiled', members: [] },
        revision: 4,
        updatedByUserId: DISCORD_ID,
        updatedAtIso: '2026-09-09T10:00:00.000Z',
      }),
    ),
    getViewerSnapshot: vi.fn(() =>
      Promise.resolve({
        ownerUserId: DISCORD_ID,
        state: { viewer: { id: 'owner-app-id', discordAccountId: DISCORD_ID } },
        revision: 2,
        updatedAtIso: '2026-09-09T10:00:00.000Z',
      }),
    ),
    ...overrides,
  } as unknown as PlayerTeamStateUseCases;

  return {
    controller: new DiscordGatewayPlayerTeamReadController(useCases, {
      PLAYER_TEAM_DISCORD_GATEWAY_SHARED_SECRET: SECRET,
    } as never),
    useCases,
  };
}

describe('DiscordGatewayPlayerTeamReadController', () => {
  it('returns only a member-authorized workspace for valid gateway credentials', async () => {
    const { controller, useCases } = createController();

    const result = await controller.getWorkspaceState(
      {
        'x-discord-gateway-secret': SECRET,
        'x-discord-user-id': DISCORD_ID,
      },
      'team-1',
    );

    expect(useCases.getWorkspaceSnapshot).toHaveBeenCalledWith(DISCORD_ID, 'team-1');
    expect(result.state).toMatchObject({ id: 'team-1', name: 'Destiled' });
    expect(result.viewerAppId).toBe('owner-app-id');
    expect(result.revision).toBe(4);
  });

  it('rejects a wrong gateway secret before reading workspace state', async () => {
    const { controller, useCases } = createController();

    await expect(
      controller.getWorkspaceState(
        {
          'x-discord-gateway-secret': 'wrong-secret',
          'x-discord-user-id': DISCORD_ID,
        },
        'team-1',
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(useCases.getWorkspaceSnapshot).not.toHaveBeenCalled();
  });

  it('rejects a non-Discord identity before reading workspace state', async () => {
    const { controller, useCases } = createController();

    await expect(
      controller.getWorkspaceState(
        {
          'x-discord-gateway-secret': SECRET,
          'x-discord-user-id': 'owner-app-id',
        },
        'team-1',
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(useCases.getWorkspaceSnapshot).not.toHaveBeenCalled();
  });
});
