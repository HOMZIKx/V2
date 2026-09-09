import { describe, expect, it, vi } from 'vitest';

import { PlayerTeamStateUseCases } from './player-team-state.use-cases.js';
import {
  type PlayerTeamStateRepositoryPort,
  type WorkspaceSnapshotRecord,
} from '../../domain/ports/player-team-state.port.js';

const DISCORD_ID = '808066932753563668';
const OTHER_DISCORD_ID = '111122223333444455';
const APP_ID = 'viewer-app-id';
const WORKSPACE_ID = 'destiled-main';

function privateViewerSnapshot() {
  return {
    ownerUserId: DISCORD_ID,
    state: {
      viewer: { id: APP_ID, discordAccountId: DISCORD_ID },
      workspaces: [
        {
          id: WORKSPACE_ID,
          archived: false,
          members: [{ id: APP_ID, role: 'owner' }],
        },
      ],
    },
    revision: 3,
    updatedAtIso: '2026-09-09T09:00:00.000Z',
  };
}

function sharedSnapshot(
  member: Record<string, unknown>,
  revision = 4,
): WorkspaceSnapshotRecord {
  return {
    workspaceId: WORKSPACE_ID,
    state: {
      id: WORKSPACE_ID,
      archived: false,
      members: [member],
    },
    revision,
    updatedByUserId: OTHER_DISCORD_ID,
    updatedAtIso: '2026-09-09T09:00:00.000Z',
  };
}

function repository(existing: WorkspaceSnapshotRecord): PlayerTeamStateRepositoryPort {
  return {
    getViewerSnapshot: vi.fn(() => Promise.resolve(privateViewerSnapshot())),
    upsertViewerSnapshot: vi.fn(() => Promise.resolve({ revision: 1 })),
    getWorkspaceSnapshot: vi.fn(() => Promise.resolve(existing)),
    upsertWorkspaceSnapshot: vi.fn((input) =>
      Promise.resolve({
        workspaceId: input.workspaceId,
        state: input.state,
        revision: (input.expectedRevision ?? -1) + 1,
        updatedByUserId: input.updatedByUserId,
        updatedAtIso: '2026-09-09T09:01:00.000Z',
      }),
    ),
    pingDatabase: vi.fn(() => Promise.resolve(true)),
    isMigrationApplied: vi.fn(() => Promise.resolve(true)),
  };
}

describe('shared workspace Discord identity backfill', () => {
  it('persists a verified Discord snowflake onto a matching legacy app member', async () => {
    const repo = repository(sharedSnapshot({ id: APP_ID, role: 'owner' }));
    const useCases = new PlayerTeamStateUseCases(repo, { allowDemoWrite: true });

    const result = await useCases.getWorkspaceSnapshot(DISCORD_ID, WORKSPACE_ID);

    expect(result.state.members).toEqual([
      { id: APP_ID, role: 'owner', discordAccountId: DISCORD_ID },
    ]);
    expect(repo.upsertWorkspaceSnapshot).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      state: {
        id: WORKSPACE_ID,
        archived: false,
        members: [{ id: APP_ID, role: 'owner', discordAccountId: DISCORD_ID }],
      },
      expectedRevision: 4,
      updatedByUserId: DISCORD_ID,
    });
  });

  it('does not authorize an app-id fallback over a conflicting stored Discord identity', async () => {
    const repo = repository(
      sharedSnapshot({
        id: APP_ID,
        discordAccountId: OTHER_DISCORD_ID,
        role: 'owner',
      }),
    );
    const useCases = new PlayerTeamStateUseCases(repo, { allowDemoWrite: true });

    await expect(useCases.getWorkspaceSnapshot(DISCORD_ID, WORKSPACE_ID)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(repo.upsertWorkspaceSnapshot).not.toHaveBeenCalled();
  });
});
