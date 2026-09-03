import { describe, expect, it } from 'vitest';

import type { TeamDetailDto, TeamRecordDto } from './player-workspace-api';
import {
  mapBoardsToDashboardCharacters,
  mapTeamDetailToDashboard,
  mapTeamDetailToWorkspace,
} from './player-workspace-mappers';

const team: TeamRecordDto = {
  id: 'team-1',
  name: 'Alpha',
  createdByUserId: 'user-a',
  revision: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const detail: TeamDetailDto = {
  team,
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
};

describe('player-workspace mappers', () => {
  it('keeps Pulpit valid with zero characters and empty deferred surfaces', () => {
    const snapshot = mapTeamDetailToDashboard('Gracz', team, []);
    expect(snapshot.characters).toEqual([]);
    expect(snapshot.quickActions).toEqual([]);
    expect(snapshot.equipmentSets).toEqual([]);
    expect(snapshot.history).toEqual([]);
    expect(snapshot.teamMembers).toEqual([]);
  });

  it('maps real boards without inventing EQ progress', () => {
    const characters = mapBoardsToDashboardCharacters([
      {
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
    ]);
    expect(characters).toHaveLength(1);
    expect(characters[0]?.equipmentCount).toBe(0);
    expect(characters[0]?.readyTimers).toBe(0);
  });

  it('keeps workspace deferred tasks and notes empty', () => {
    const workspace = mapTeamDetailToWorkspace('Gracz', detail, []);
    expect(workspace.characters).toEqual([]);
    expect(workspace.tasks).toEqual([]);
    expect(workspace.notes).toEqual([]);
    expect(workspace.members[0]?.roleLabel).toBe('Właściciel');
  });
});
