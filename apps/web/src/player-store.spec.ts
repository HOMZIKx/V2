import { describe, expect, it } from 'vitest';

import {
  completeDiscordAuth,
  createCharacter,
  createInitialPlayerStore,
  createOutgoingInvitation,
  createWorkspace,
  getReadyTimers,
  getSlotReadiness,
  markTimerDone,
  seedDemoData,
  startDiscordAuth,
} from './player-store';

describe('player store first-slice', () => {
  it('starts unauthenticated and can complete Discord entry', () => {
    let state = createInitialPlayerStore();
    expect(state.authStatus).toBe('unauthenticated');
    state = startDiscordAuth(state);
    expect(state.authStatus).toBe('authenticating');
    state = completeDiscordAuth(state, 'authenticated');
    expect(state.authStatus).toBe('authenticated');
    expect(state.viewer?.displayName).toBe('Mateusz');
    expect(state.workspaces).toEqual([]);
  });

  it('creates a workspace and first character without invented EQ', () => {
    let state = completeDiscordAuth(createInitialPlayerStore(), 'authenticated');
    state = createWorkspace(state, 'Moja przestrzeń');
    expect(state.workspaces).toHaveLength(1);
    const workspaceId = state.workspaces[0]!.id;
    state = createCharacter(state, workspaceId, {
      name: 'NowaSura',
      characterClass: 'sura',
      gender: 'male',
      level: 42,
      responsibleMemberId: 'mateusz',
      startingSetName: 'Główny',
    });
    const workspace = state.workspaces[0]!;
    expect(workspace.characters).toHaveLength(1);
    expect(workspace.characters[0]!.name).toBe('NowaSura');
    expect(workspace.characters[0]!.sets[0]!.name).toBe('Główny');
    expect(
      Object.values(workspace.characters[0]!.sets[0]!.assignments).every((v) => v === null),
    ).toBe(true);
    expect(workspace.history[0]!.title).toContain('Utworzono postać');
  });

  it('seeds demo data with ready timers and set readiness', () => {
    let state = completeDiscordAuth(createInitialPlayerStore(), 'authenticated');
    state = seedDemoData(state);
    expect(state.workspaces[0]!.id).toBe('asteria');
    expect(getReadyTimers(state).length).toBeGreaterThan(0);
    const workspace = state.workspaces[0]!;
    const character = workspace.characters.find((entry) => entry.id === 'nerwnicht')!;
    const set = character.sets.find((entry) => entry.id === 'war')!;
    expect(getSlotReadiness(workspace, character, set, 'weapon')).toBe('ready');
    expect(getSlotReadiness(workspace, character, set, 'shield')).toBe('ready');
    expect(workspace.items.every((item) => item.enhancement >= 0 && item.enhancement <= 9)).toBe(
      true,
    );
    const ninja = workspace.characters.find((entry) => entry.id === 'aalpsik')!;
    expect(ninja.sets[0]!.assignments.weapon).toBe('ninja-knife');
    expect(ninja.sets[0]!.assignments.armor).toBeNull();
    expect(workspace.items.some((item) => item.id === 'sura-sword')).toBe(true);
    // Shared one-handed sword (Gameforge: Warrior/Ninja/Sura) — intentional demo card.
    expect(workspace.items.some((item) => /Zatruty Miecz/u.test(item.name))).toBe(true);
    expect(
      workspace.items
        .find((item) => item.id === 'sura-helmet')
        ?.bonuses.some((line) => line.includes('Obrona')),
    ).toBe(true);
  });

  it('seeds demo without wiping an existing workspace when merge is requested', () => {
    let state = completeDiscordAuth(createInitialPlayerStore(), 'authenticated');
    state = createWorkspace(state, 'SoloTest');
    expect(state.workspaces).toHaveLength(1);
    state = seedDemoData(state, { replace: false });
    expect(state.workspaces.some((workspace) => workspace.id === 'asteria')).toBe(true);
    expect(state.workspaces.some((workspace) => workspace.name === 'SoloTest')).toBe(true);
  });

  it('creates a durable outgoing invitation with a followable link id', () => {
    let state = seedDemoData(completeDiscordAuth(createInitialPlayerStore(), 'authenticated'));
    state = createOutgoingInvitation(state, 'asteria', {
      discordUserId: '994001220033445566',
      displayName: 'MobbynZS Oak',
      initials: 'MO',
    });
    const invite = state.workspaces[0]!.invitations.find((entry) => entry.status === 'pending');
    expect(invite).toBeTruthy();
    expect(state.pendingIncomingInvitations.some((entry) => entry.id === invite!.id)).toBe(true);
  });

  it('resets timers idempotently with operation id', () => {
    let state = seedDemoData(completeDiscordAuth(createInitialPlayerStore(), 'authenticated'));
    const timerId = 'horse-medal-aalpsik';
    state = markTimerDone(state, 'asteria', timerId, 'op-1');
    const first = state.workspaces[0]!.timers.find((timer) => timer.id === timerId)!;
    expect(first.remainingLabel).toBe('odliczanie rozpoczęte');
    state = markTimerDone(state, 'asteria', timerId, 'op-1');
    const second = state.workspaces[0]!.timers.find((timer) => timer.id === timerId)!;
    expect(second.operationId).toBe('op-1');
  });
});
