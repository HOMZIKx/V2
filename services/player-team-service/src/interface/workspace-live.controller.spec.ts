import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { PlayerTeamError } from '../domain/errors.js';
import { WorkspaceLiveController } from './workspace-live.controller.js';
import { WorkspaceLiveBus } from './workspace-live.bus.js';

describe('WorkspaceLiveController production auth', () => {
  const env = {
    PLAYER_TEAM_DEMO_VIEWER_HEADER: 'x-demo-viewer',
    PLAYER_TEAM_AUTHENTICATED_DISCORD_HEADER: 'x-authenticated-discord-user-id',
    PLAYER_TEAM_INTERNAL_JWT_ENABLED: true,
    PLAYER_TEAM_INTERNAL_JWT_JWKS_URL: undefined,
    PLAYER_TEAM_INTERNAL_JWT_ISSUER: undefined,
    PLAYER_TEAM_INTERNAL_JWT_AUDIENCE: 'player-team',
  } as never;

  function controller() {
    const useCases = {
      assertDemoAccess: vi.fn(() => {
        throw new Error('demo auth must not be used in production JWT mode');
      }),
      getWorkspaceSnapshot: vi.fn(),
      upsertWorkspaceSnapshot: vi.fn(),
    } as never;
    return {
      instance: new WorkspaceLiveController(useCases, env, new WorkspaceLiveBus()),
      useCases: useCases as unknown as {
        getWorkspaceSnapshot: ReturnType<typeof vi.fn>;
        upsertWorkspaceSnapshot: ReturnType<typeof vi.fn>;
      },
    };
  }

  it('rejects GET without a verified internal bearer token instead of falling back to demo access', async () => {
    const { instance, useCases } = controller();

    await expect(
      instance.getState(
        { 'x-authenticated-discord-user-id': '123456789012345678' },
        'workspace-a',
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' } satisfies Partial<PlayerTeamError>);

    expect(useCases.getWorkspaceSnapshot).not.toHaveBeenCalled();
  });

  it('rejects PUT without a verified internal bearer token before writing shared workspace state', async () => {
    const { instance, useCases } = controller();

    await expect(
      instance.putState(
        { 'x-authenticated-discord-user-id': '123456789012345678' },
        'workspace-a',
        { state: { id: 'workspace-a' }, expectedRevision: 0 },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' } satisfies Partial<PlayerTeamError>);

    expect(useCases.upsertWorkspaceSnapshot).not.toHaveBeenCalled();
  });

  it('rejects SSE subscription without a verified internal bearer token before reading workspace data', async () => {
    const { instance, useCases } = controller();

    await expect(
      firstValueFrom(
        instance.events(
          { 'x-authenticated-discord-user-id': '123456789012345678' },
          'workspace-a',
        ),
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' } satisfies Partial<PlayerTeamError>);

    expect(useCases.getWorkspaceSnapshot).not.toHaveBeenCalled();
  });
});
