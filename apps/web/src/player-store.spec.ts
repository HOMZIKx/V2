import { describe, expect, it } from 'vitest';

import {
  archiveCharacter,
  assignItemToSet,
  unequipItemToBag,
  updateEquipmentItemBonuses,
  completeDiscordAuth,
  createCharacter,
  createEquipmentItem,
  createEquipmentSet,
  renameEquipmentSet,
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
  it('accepts an Identity-backed viewer override (V2 uuid id)', () => {
    let state = startDiscordAuth(createInitialPlayerStore());
    state = completeDiscordAuth(state, 'authenticated', {
      v2UserId: '11111111-2222-4333-8444-555555555555',
      displayName: 'Mateusz C.',
      discordUserId: '123456789012345678',
    });
    expect(state.viewer?.id).toBe('11111111-2222-4333-8444-555555555555');
    expect(state.viewer?.discordAccountId).toBe('123456789012345678');
    expect(state.viewer?.displayName).toBe('Mateusz C.');
  });

  it('creates a workspace and first character without invented EQ', () => {
    let state = completeDiscordAuth(createInitialPlayerStore(), 'authenticated');
    state = createWorkspace(state, 'Moja przestrzeń');
    expect(state.workspaces).toHaveLength(1);
    const workspaceId = state.workspaces[0]!.id;
    state = createCharacter(state, workspaceId, {
      name: 'NowaSura',
      characterClass: 'sura',
      skillPath: 'sura_weapon',
      appearanceLook: 'azrael',
      gender: 'male',
      level: 42,
      responsibleMemberId: 'mateusz',
      startingSetName: 'Główny',
    });
    const workspace = state.workspaces[0]!;
    expect(workspace.characters).toHaveLength(1);
    expect(workspace.characters[0]!.name).toBe('NowaSura');
    expect(workspace.characters[0]!.appearanceLook).toBe('azrael');
    expect(workspace.characters[0]!.imagePath).toBe('/game/classes/looks/azrael/sura-male.png');
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
    expect(getSlotReadiness(workspace, character, set, 'bracelet')).toBe('ready');
    const emptySet = character.sets.find((entry) => entry.id === 'empty')!;
    expect(getSlotReadiness(workspace, character, emptySet, 'weapon')).toBe('empty');
    // Same physical card planned on two characters = conflict.
    const xiaohu = workspace.characters.find((entry) => entry.id === 'xiaohu')!;
    const xiaohuSet = {
      ...xiaohu.sets[0]!,
      assignments: { ...xiaohu.sets[0]!.assignments, shield: 'sura-shield' },
    };
    expect(getSlotReadiness(workspace, xiaohu, xiaohuSet, 'shield')).toBe('conflict');
    expect(workspace.items.every((item) => item.enhancement >= 0 && item.enhancement <= 9)).toBe(
      true,
    );
    const ninja = workspace.characters.find((entry) => entry.id === 'aalpsik')!;
    expect(ninja.sets[0]!.assignments.weapon).toBe('ninja-knife');
    expect(ninja.sets[0]!.assignments.armor).toBeNull();
    expect(workspace.items.some((item) => item.id === 'sura-sword')).toBe(true);
    // Shared one-handed sword (Gameforge: Warrior/Ninja/Sura) â€” intentional demo card.
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

  it('keeps outgoing invitations on the workspace list, not in the viewer inbox', () => {
    let state = seedDemoData(completeDiscordAuth(createInitialPlayerStore(), 'authenticated'));
    state = createOutgoingInvitation(state, 'asteria', {
      discordUserId: '994001220033445566',
      displayName: 'MobbynZS Oak',
      initials: 'MO',
    });
    const invite = state.workspaces[0]!.invitations.find((entry) => entry.status === 'pending');
    expect(invite).toBeTruthy();
    expect(state.pendingIncomingInvitations.some((entry) => entry.id === invite!.id)).toBe(false);
  });

  it('resets Project Hard timers with kind-specific cooldowns', () => {
    let state = seedDemoData(completeDiscordAuth(createInitialPlayerStore(), 'authenticated'));
    const timerId = 'horse-aalpsik';
    state = markTimerDone(state, 'asteria', timerId, 'op-1');
    const first = state.workspaces[0]!.timers.find((timer) => timer.id === timerId)!;
    expect(first.remainingLabel).toContain('23 h');
    state = markTimerDone(state, 'asteria', timerId, 'op-1');
    const second = state.workspaces[0]!.timers.find((timer) => timer.id === timerId)!;
    expect(second.operationId).toBe('op-1');
  });

  it('seeds unique character ids without auto PH timers on create', () => {
    let state = completeDiscordAuth(createInitialPlayerStore(), 'authenticated');
    state = createWorkspace(state, 'Solo');
    const workspaceId = state.workspaces[0]!.id;
    state = createCharacter(state, workspaceId, {
      name: 'Duplikat',
      characterClass: 'warrior',
      skillPath: 'warrior_body',
      gender: 'male',
      level: 61,
      responsibleMemberId: 'mateusz',
    });
    state = createCharacter(state, workspaceId, {
      name: 'Duplikat',
      characterClass: 'sura',
      skillPath: 'sura_magic',
      gender: 'female',
      level: 30,
      responsibleMemberId: 'mateusz',
    });
    const workspace = state.workspaces[0]!;
    expect(workspace.characters.map((character) => character.id)).toEqual([
      'duplikat',
      'duplikat-2',
    ]);
    expect(workspace.timers.filter((timer) => timer.characterId === 'duplikat')).toEqual([]);
  });

  it('allows adding more than one equipment set after character creation', () => {
    let state = completeDiscordAuth(createInitialPlayerStore(), 'authenticated');
    state = createWorkspace(state, 'Solo');
    const workspaceId = state.workspaces[0]!.id;
    state = createCharacter(state, workspaceId, {
      name: 'Setowy',
      characterClass: 'warrior',
      skillPath: 'warrior_body',
      gender: 'male',
      level: 40,
      responsibleMemberId: 'mateusz',
      startingSetName: 'Główny',
    });
    const characterId = state.workspaces[0]!.characters[0]!.id;
    expect(state.workspaces[0]!.characters[0]!.sets).toHaveLength(1);

    const first = createEquipmentSet(state, workspaceId, characterId, { name: 'Loch' });
    state = first.state;
    expect(first.setId).toBe('loch');
    expect(state.workspaces[0]!.characters[0]!.sets.map((set) => set.name)).toEqual([
      'Główny',
      'Loch',
    ]);
    expect(state.workspaces[0]!.characters[0]!.activeSetId).toBe('loch');

    const second = createEquipmentSet(state, workspaceId, characterId, {
      name: 'Wojna',
      makeActive: false,
    });
    state = second.state;
    expect(second.setId).toBe('wojna');
    expect(state.workspaces[0]!.characters[0]!.sets).toHaveLength(3);
    expect(state.workspaces[0]!.characters[0]!.activeSetId).toBe('loch');
  });

  it('renames an equipment set without changing its id', () => {
    let state = completeDiscordAuth(createInitialPlayerStore(), 'authenticated');
    state = createWorkspace(state, 'Set rename');
    const workspaceId = state.workspaces[0]!.id;
    state = createCharacter(state, workspaceId, {
      name: 'RenameHero',
      characterClass: 'warrior',
      skillPath: 'warrior_body',
      gender: 'male',
      level: 40,
      responsibleMemberId: 'mateusz',
      startingSetName: 'Główny',
    });
    const characterId = state.workspaces[0]!.characters[0]!.id;
    const setId = state.workspaces[0]!.characters[0]!.sets[0]!.id;
    const renamed = renameEquipmentSet(state, workspaceId, characterId, setId, 'Loch PH');
    expect(renamed.ok).toBe(true);
    state = renamed.state;
    expect(state.workspaces[0]!.characters[0]!.sets[0]!.id).toBe(setId);
    expect(state.workspaces[0]!.characters[0]!.sets[0]!.name).toBe('Loch PH');
    expect(renameEquipmentSet(state, workspaceId, characterId, setId, 'x').ok).toBe(false);
  });

  it('archives a character out of the living roster', () => {
    let state = completeDiscordAuth(createInitialPlayerStore(), 'authenticated');
    state = createWorkspace(state, 'SkĹ‚ad test');
    const workspaceId = state.workspaces[0]!.id;
    state = createCharacter(state, workspaceId, {
      name: 'DoUsuniecia',
      characterClass: 'warrior',
      skillPath: 'warrior_body',
      gender: 'male',
      level: 10,
      responsibleMemberId: 'mateusz',
    });
    const characterId = state.workspaces[0]!.characters[0]!.id;
    state = { ...state, lastOpenedCharacterId: characterId };
    state = archiveCharacter(state, workspaceId, characterId);
    expect(state.workspaces[0]!.characters[0]!.archived).toBe(true);
    expect(state.workspaces[0]!.history[0]!.title).toContain('Usunięto postać');
    expect(state.lastOpenedCharacterId).toBeNull();
  });

  it('gives every demo character the Project Hard cyclical timers', () => {
    const state = seedDemoData(completeDiscordAuth(createInitialPlayerStore(), 'authenticated'));
    const workspace = state.workspaces[0]!;
    for (const character of workspace.characters) {
      const kinds = new Set(
        workspace.timers
          .filter((timer) => timer.characterId === character.id)
          .map((timer) => timer.kind),
      );
      expect(kinds.has('skill_book')).toBe(true);
      expect(kinds.has('soul_stone')).toBe(true);
      expect(kinds.has('leadership')).toBe(true);
      expect(kinds.has('polymorph')).toBe(true);
      expect(kinds.has('mining')).toBe(true);
      expect(kinds.has('horse')).toBe(true);
      if ((character.level ?? 0) >= 30) {
        expect(kinds.has('biologist')).toBe(true);
      }
      expect(Array.from(kinds as Set<string>).includes('combo')).toBe(false);
      for (const timer of workspace.timers.filter((entry) => entry.characterId === character.id)) {
        expect(timer.iconPath).toMatch(/^\/game\/progression\//);
      }
    }
  });
  it('moves an equipped item between characters instead of copying it', () => {
    let state = completeDiscordAuth(createInitialPlayerStore(), 'authenticated');
    state = seedDemoData(state);
    const workspaceId = state.workspaces[0]!.id;
    const created = createEquipmentItem(state, workspaceId, {
      name: 'Ebonitowe Kolczyki',
      category: 'earrings',
      enhancement: 9,
      bonuses: [],
      planned: true,
    });
    state = created.state;
    const itemId = created.itemId!;
    expect(itemId).toBeTruthy();

    const nerw = state.workspaces[0]!.characters.find((entry) => entry.id === 'nerwnicht')!;
    const aalp = state.workspaces[0]!.characters.find((entry) => entry.id === 'aalpsik')!;
    const nerwSet = nerw.activeSetId || nerw.sets[0]!.id;
    const aalpSet = aalp.activeSetId || aalp.sets[0]!.id;

    state = assignItemToSet(state, workspaceId, nerw.id, nerwSet, itemId, 'earrings');
    expect(
      state.workspaces[0]!.characters
        .find((entry) => entry.id === nerw.id)!
        .sets.find((set) => set.id === nerwSet)!.assignments.earrings,
    ).toBe(itemId);

    state = assignItemToSet(state, workspaceId, aalp.id, aalpSet, itemId, 'earrings');
    const workspace = state.workspaces[0]!;
    const onNerw = workspace.characters
      .find((entry) => entry.id === nerw.id)!
      .sets.find((set) => set.id === nerwSet)!.assignments.earrings;
    const onAalp = workspace.characters
      .find((entry) => entry.id === aalp.id)!
      .sets.find((set) => set.id === aalpSet)!.assignments.earrings;
    expect(onAalp).toBe(itemId);
    expect(onNerw).toBeNull();

    const owners = workspace.characters.flatMap((character) =>
      character.sets.flatMap((set) =>
        Object.values(set.assignments).filter((id) => id === itemId).map(() => character.id),
      ),
    );
    expect(owners).toEqual([aalp.id]);
  });



  it('unequipItemToBag clears the item from every character set', () => {
    let state = completeDiscordAuth(createInitialPlayerStore(), 'authenticated');
    state = seedDemoData(state);
    const workspaceId = state.workspaces[0]!.id;
    const created = createEquipmentItem(state, workspaceId, {
      name: 'Ebonitowe Kolczyki',
      category: 'earrings',
      enhancement: 9,
      bonuses: [],
      planned: true,
    });
    state = created.state;
    const itemId = created.itemId!;
    const nerw = state.workspaces[0]!.characters.find((entry) => entry.id === 'nerwnicht')!;
    const setA = nerw.sets[0]!.id;
    state = createEquipmentSet(state, workspaceId, nerw.id, { name: 'Set B' }).state;
    const setB =
      state.workspaces[0]!.characters.find((entry) => entry.id === nerw.id)!.sets.find(
        (set) => set.id !== setA,
      )!.id;

    // Simulate ghost assignment on a second set (pre-fix unique-ownership gap).
    state = assignItemToSet(state, workspaceId, nerw.id, setA, itemId, 'earrings');
    state = {
      ...state,
      workspaces: state.workspaces.map((workspace) =>
        workspace.id !== workspaceId
          ? workspace
          : {
              ...workspace,
              characters: workspace.characters.map((character) =>
                character.id !== nerw.id
                  ? character
                  : {
                      ...character,
                      sets: character.sets.map((set) =>
                        set.id === setB
                          ? { ...set, assignments: { ...set.assignments, earrings: itemId } }
                          : set,
                      ),
                    },
              ),
            },
      ),
    };

    state = unequipItemToBag(state, workspaceId, itemId);
    const owners = state.workspaces[0]!.characters.flatMap((character) =>
      character.sets.flatMap((set) =>
        Object.values(set.assignments).filter((id) => id === itemId),
      ),
    );
    expect(owners).toEqual([]);
    expect(state.workspaces[0]!.items.some((item) => item.id === itemId)).toBe(true);
  });

  it('updateEquipmentItemBonuses persists additional lines including free SR/UM percent', () => {
    let state = completeDiscordAuth(createInitialPlayerStore(), 'authenticated');
    state = seedDemoData(state);
    const workspaceId = state.workspaces[0]!.id;
    const created = createEquipmentItem(state, workspaceId, {
      name: 'Zatruty Miecz',
      category: 'weapon',
      enhancement: 9,
      bonuses: [],
      planned: true,
    });
    state = created.state;
    const itemId = created.itemId!;
    const additional = [
      'SiĹ‚a +12',
      'Ĺšrednie ObraĹĽenia +27%',
      'ObraĹĽenia UmiejÄ™tnoĹ›ci +12%',
    ] as const;

    state = updateEquipmentItemBonuses(state, workspaceId, itemId, additional, {
      enhancement: 9,
    });
    const item = state.workspaces[0]!.items.find((entry) => entry.id === itemId)!;
    expect(item.bonuses).toEqual(expect.arrayContaining([...additional]));
    // Saving again with a pre-merged payload must not wipe additionals.
    state = updateEquipmentItemBonuses(state, workspaceId, itemId, item.bonuses, {
      enhancement: 9,
    });
    const again = state.workspaces[0]!.items.find((entry) => entry.id === itemId)!;
    for (const line of additional) {
      expect(again.bonuses).toContain(line);
    }
  });


});
