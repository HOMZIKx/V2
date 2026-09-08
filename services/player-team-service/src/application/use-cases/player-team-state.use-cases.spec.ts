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

function viewerSnapshot(input: {
  discordId: string;
  appId: string;
  workspace: Record<string, unknown>;
}): ViewerSnapshotRecord {
  return {
    ownerUserId: input.discordId,
    state: {
      viewer: { id: input.appId, discordAccountId: input.discordId },
      workspaces: [input.workspace],
    },
    revision: 3,
    updatedAtIso: '2026-09-07T18:00:00.000Z',
  };
}

function sharedSnapshot(
  workspaceId: string,
  state: Record<string, unknown>,
  revision = 4,
): WorkspaceSnapshotRecord {
  return {
    workspaceId,
    state,
    revision,
    updatedByUserId: '111122223333444455',
    updatedAtIso: '2026-09-07T18:00:01.000Z',
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
    const viewerRecord = viewerSnapshot({
      discordId,
      appId: 'viewer-app-id',
      workspace,
    });
    const created = sharedSnapshot('destiled-main', workspace, 0);
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

  it('does not trust a forged private owner role when shared membership belongs to another team', async () => {
    const attackerDiscordId = '808066932753563668';
    const privateWorkspace = {
      id: 'same-name',
      archived: false,
      members: [
        {
          id: 'attacker-app-id',
          discordAccountId: attackerDiscordId,
          role: 'owner',
        },
      ],
      invitations: [],
    };
    const realShared = {
      id: 'same-name',
      archived: false,
      members: [
        {
          id: 'real-owner',
          discordAccountId: '111122223333444455',
          role: 'owner',
        },
      ],
      invitations: [],
    };
    const useCases = new PlayerTeamStateUseCases(
      createRepository({
        getViewerSnapshot: vi.fn(() =>
          Promise.resolve(
            viewerSnapshot({
              discordId: attackerDiscordId,
              appId: 'attacker-app-id',
              workspace: privateWorkspace,
            }),
          ),
        ),
        getWorkspaceSnapshot: vi.fn(() => Promise.resolve(sharedSnapshot('same-name', realShared))),
      }),
      { allowDemoWrite: true },
    );

    await expect(
      useCases.getWorkspaceSnapshot(attackerDiscordId, 'same-name'),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('blocks a member from changing owner-only workspace fields', async () => {
    const memberDiscordId = '994001220033445566';
    const memberAppId = 'member-app-id';
    const current = {
      id: 'team-1',
      name: 'Destiled',
      description: 'Team',
      archived: false,
      notifyPrefs: { characterTimers: true, kingdomWar: true },
      members: [
        {
          id: 'owner-app-id',
          discordAccountId: '111122223333444455',
          role: 'owner',
        },
        {
          id: memberAppId,
          discordAccountId: memberDiscordId,
          role: 'member',
        },
      ],
      invitations: [],
    };
    const privateWorkspace = structuredClone(current);
    const useCases = new PlayerTeamStateUseCases(
      createRepository({
        getViewerSnapshot: vi.fn(() =>
          Promise.resolve(
            viewerSnapshot({
              discordId: memberDiscordId,
              appId: memberAppId,
              workspace: privateWorkspace,
            }),
          ),
        ),
        getWorkspaceSnapshot: vi.fn(() => Promise.resolve(sharedSnapshot('team-1', current))),
      }),
      { allowDemoWrite: true },
    );

    await expect(
      useCases.upsertWorkspaceSnapshot({
        ownerUserId: memberDiscordId,
        workspaceId: 'team-1',
        state: { ...current, name: 'Przejęty zespół' },
        expectedRevision: 4,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('allows a member to change only their own notification override', async () => {
    const memberDiscordId = '994001220033445566';
    const memberAppId = 'member-app-id';
    const current = {
      id: 'team-1',
      name: 'Destiled',
      description: 'Team',
      archived: false,
      notifyPrefs: { characterTimers: true, kingdomWar: true },
      members: [
        {
          id: 'owner-app-id',
          discordAccountId: '111122223333444455',
          role: 'owner',
        },
        {
          id: memberAppId,
          discordAccountId: memberDiscordId,
          role: 'member',
        },
      ],
      invitations: [],
    };
    const privateWorkspace = structuredClone(current);
    const next = {
      ...current,
      members: [
        current.members[0],
        { ...current.members[1], notifyPrefs: { characterTimers: false } },
      ],
    };
    const upsertWorkspaceSnapshot = vi.fn((input) =>
      Promise.resolve(sharedSnapshot('team-1', input.state, 5)),
    );
    const useCases = new PlayerTeamStateUseCases(
      createRepository({
        getViewerSnapshot: vi.fn(() =>
          Promise.resolve(
            viewerSnapshot({
              discordId: memberDiscordId,
              appId: memberAppId,
              workspace: privateWorkspace,
            }),
          ),
        ),
        getWorkspaceSnapshot: vi.fn(() => Promise.resolve(sharedSnapshot('team-1', current))),
        upsertWorkspaceSnapshot,
      }),
      { allowDemoWrite: true },
    );

    await expect(
      useCases.upsertWorkspaceSnapshot({
        ownerUserId: memberDiscordId,
        workspaceId: 'team-1',
        state: next,
        expectedRevision: 4,
      }),
    ).resolves.toMatchObject({ revision: 5 });
    expect(upsertWorkspaceSnapshot).toHaveBeenCalledOnce();
  });
});
