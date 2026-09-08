import { describe, expect, it } from 'vitest';

import {
  archiveEquipmentItem,
  buildDemoWorkspace,
  createInitialPlayerStore,
  parsePlayerStore,
  updateEquipmentItemCard,
  type PlayerIdentity,
  type PlayerStoreState,
} from './player-store.js';

const viewer: PlayerIdentity = {
  id: '808066932753563668',
  discordAccountId: '808066932753563668',
  displayName: 'Tester',
  discordDisplayName: 'Tester',
  initials: 'T',
};

function buildState(): PlayerStoreState {
  const workspace = buildDemoWorkspace(viewer);
  return {
    ...createInitialPlayerStore(),
    authStatus: 'authenticated',
    connection: 'connected',
    viewer,
    workspaces: [workspace],
    seededDemo: true,
  };
}

function assignmentValues(state: PlayerStoreState, workspaceId: string): readonly (string | null)[] {
  const workspace = state.workspaces.find((entry) => entry.id === workspaceId)!;
  return workspace.characters.flatMap((character) =>
    character.sets.flatMap((set) => Object.values(set.assignments)),
  );
}

describe('player store equipment mutations', () => {
  it('updates the same item id and removes stale set assignments when category changes', () => {
    const state = buildState();
    const workspace = state.workspaces[0]!;
    expect(assignmentValues(state, workspace.id)).toContain('sura-sword');

    const result = updateEquipmentItemCard(state, workspace.id, 'sura-sword', {
      name: 'Testowa Tarcza',
      category: 'shield',
      enhancement: 7,
      bonuses: ['Max PŻ +2000'],
    });

    expect(result.ok).toBe(true);
    const updatedWorkspace = result.state.workspaces.find((entry) => entry.id === workspace.id)!;
    const updated = updatedWorkspace.items.find((item) => item.id === 'sura-sword')!;

    expect(updated.id).toBe('sura-sword');
    expect(updated.name).toContain('Testowa Tarcza');
    expect(updated.enhancement).toBe(7);
    expect(updated.category).toBe('shield');
    expect(updated.lastConfirmedLocation).toBe('Torba I');
    expect(assignmentValues(result.state, workspace.id)).not.toContain('sura-sword');
  });

  it('archives an item and clears it from every equipment set', () => {
    const state = buildState();
    const workspace = state.workspaces[0]!;
    expect(assignmentValues(state, workspace.id)).toContain('sura-sword');

    const next = archiveEquipmentItem(state, workspace.id, 'sura-sword');
    const archived = next.workspaces
      .find((entry) => entry.id === workspace.id)!
      .items.find((item) => item.id === 'sura-sword')!;

    expect(archived.archived).toBe(true);
    expect(archived.planned).toBe(false);
    expect(archived.lastConfirmedLocation).toBeNull();
    expect(assignmentValues(next, workspace.id)).not.toContain('sura-sword');
  });

  it('migrates the old Usunięte location sentinel to archived on parse', () => {
    const state = buildState();
    const raw = JSON.parse(JSON.stringify(state)) as {
      workspaces: Array<{ items: Array<Record<string, unknown>> }>;
    };
    const item = raw.workspaces[0]!.items.find((entry) => entry.id === 'sura-sword')!;
    item.archived = false;
    item.lastConfirmedLocation = 'Usunięte';

    const parsed = parsePlayerStore(JSON.stringify(raw));
    const migrated = parsed?.workspaces[0]?.items.find((entry) => entry.id === 'sura-sword');

    expect(migrated?.archived).toBe(true);
  });
});
