import { describe, expect, it } from 'vitest';

import { createInitialPlayerStore, seedDemoData } from './player-store';
import { mergeServerSnapshot, shouldApplyServerSnapshot } from './player-team-sync';

describe('shouldApplyServerSnapshot', () => {
  it('keeps local state when server has no snapshot', () => {
    expect(
      shouldApplyServerSnapshot({
        localState: createInitialPlayerStore(),
        localSyncedRevision: null,
        serverState: null,
        serverRevision: null,
      }),
    ).toBe(false);
  });

  it('applies server snapshot when server revision is newer than local sync', () => {
    expect(
      shouldApplyServerSnapshot({
        localState: createInitialPlayerStore(),
        localSyncedRevision: 1,
        serverState: { authStatus: 'authenticated', workspaces: [{ id: 'ws-1' }] },
        serverRevision: 3,
      }),
    ).toBe(true);
  });

  it('keeps local demo data when server snapshot is empty at revision 0', () => {
    const localState = seedDemoData({
      ...createInitialPlayerStore(),
      authStatus: 'authenticated',
      viewer: {
        id: 'viewer-1',
        displayName: 'Mateusz',
        discordDisplayName: 'Mateusz',
        initials: 'MA',
      },
    });

    expect(
      shouldApplyServerSnapshot({
        localState,
        localSyncedRevision: null,
        serverState: { authStatus: 'authenticated', workspaces: [], seededDemo: false },
        serverRevision: 0,
      }),
    ).toBe(false);
  });

  it('does not overwrite local state when server revision is not newer', () => {
    expect(
      shouldApplyServerSnapshot({
        localState: seedDemoData(createInitialPlayerStore()),
        localSyncedRevision: 5,
        serverState: { authStatus: 'authenticated', workspaces: [{ id: 'ws-2' }] },
        serverRevision: 4,
      }),
    ).toBe(false);
  });
});

describe('mergeServerSnapshot', () => {
  it('keeps the local viewer when the server snapshot omitted it', () => {
    const localState = {
      ...createInitialPlayerStore(),
      authStatus: 'authenticated' as const,
      connection: 'connected' as const,
      viewer: {
        id: 'mateusz',
        displayName: 'Mateusz',
        discordDisplayName: 'Mateusz',
        initials: 'M',
      },
    };

    const merged = mergeServerSnapshot(localState, {
      ...createInitialPlayerStore(),
      authStatus: 'authenticated',
      viewer: null,
      workspaces: [],
    });

    expect(merged.viewer?.id).toBe('mateusz');
    expect(merged.authStatus).toBe('authenticated');
    expect(merged.connection).toBe('connected');
  });
});
