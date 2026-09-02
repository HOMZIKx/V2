import { describe, expect, it } from 'vitest';

import {
  appendTeamNote,
  applyTeamTaskOutcome,
  getTeamWorkspaceSummary,
  teamWorkspaceFixture,
} from './team-workspace.js';

describe('team workspace view model', () => {
  it('summarizes shared state without treating upcoming work as ready', () => {
    expect(getTeamWorkspaceSummary(teamWorkspaceFixture)).toEqual({
      onlineMembers: 2,
      readyTasks: 2,
      totalCharacters: 3,
      incompleteSets: 2,
    });
  });

  it('records a human-confirmed task outcome without mutating the fixture', () => {
    const updated = applyTeamTaskOutcome(
      teamWorkspaceFixture.tasks,
      'task-shield-location',
      'done',
    );

    expect(updated[0]).toMatchObject({ status: 'done', dueLabel: 'potwierdzone' });
    expect(updated[1]).toBe(teamWorkspaceFixture.tasks[1]);
    expect(teamWorkspaceFixture.tasks[0]?.status).toBe('ready');
  });

  it('trims a new team note and rejects an empty note', () => {
    const note = {
      id: 'note-new',
      authorName: 'Mateusz',
      body: '  Sprawdzić tarczę po wojnie.  ',
      createdLabel: 'teraz',
      pinned: false,
    } as const;

    expect(appendTeamNote(teamWorkspaceFixture.notes, note)[0]?.body).toBe(
      'Sprawdzić tarczę po wojnie.',
    );
    expect(appendTeamNote(teamWorkspaceFixture.notes, { ...note, body: '   ' })).toBe(
      teamWorkspaceFixture.notes,
    );
  });
});
