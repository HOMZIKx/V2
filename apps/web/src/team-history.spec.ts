import { describe, expect, it } from 'vitest';

import {
  buildResolveConflictCommand,
  connectionStateCopy,
  filterTeamHistory,
  teamHistoryFixture,
} from './team-history.js';

describe('team history and collaboration view model', () => {
  it('filters history by resource, actor, character and text', () => {
    expect(
      filterTeamHistory(teamHistoryFixture.entries, {
        query: 'tarcza',
        resource: 'equipment',
        actorId: 'xiaohu',
        characterId: 'nerwnicht',
      }).map((entry) => entry.id),
    ).toEqual(['history-shield-location']);
  });

  it('does not merge team-wide entries into a character-only filter', () => {
    expect(
      filterTeamHistory(teamHistoryFixture.entries, {
        query: '',
        resource: 'all',
        actorId: 'all',
        characterId: 'aalpsik',
      }).map((entry) => entry.id),
    ).toEqual(['history-book-timer']);
  });

  it('resolves against the latest observed server revision with an idempotency key', () => {
    const conflict = teamHistoryFixture.conflict;
    expect(conflict).not.toBeNull();
    if (!conflict) return;

    expect(buildResolveConflictCommand(conflict, 'preserve_draft', 'op-conflict-1')).toEqual({
      conflictId: 'conflict-shield-location',
      expectedServerRevision: 19,
      operationId: 'op-conflict-1',
      resolution: 'preserve_draft',
    });
  });

  it('keeps honest copy for every connection state', () => {
    expect(connectionStateCopy.reconnecting.detail).toContain('wersje robocze');
    expect(connectionStateCopy.offline.detail).toContain('poczekają');
    expect(connectionStateCopy.access_revoked.title).toBe('Dostęp zakończony');
  });
});
