import { describe, expect, it } from 'vitest';

import { DEFAULT_APPEARANCE_LOOK, defaultSkillPathForClass } from './character-profile';
import {
  addProgressionTimer,
  type PlayerStoreState,
  type ProgressTimer,
} from './player-store';

const legacyCurseBookTimer: ProgressTimer = {
  id: 'timer-curse-book',
  characterId: 'char-1',
  label: 'Księga Klątw',
  detail: 'Stary wpis ręczny',
  status: 'ready',
  readyAtIso: null,
  remainingLabel: 'gotowe',
  progressPercent: 100,
  lastActorName: null,
  lastConfirmedAt: null,
  discordReminder: false,
  reminderState: 'unavailable',
  operationId: null,
};

function stateWithLegacyBook(): PlayerStoreState {
  return {
    authStatus: 'authenticated',
    connection: 'connected',
    viewer: {
      id: 'owner-app-id',
      displayName: 'Owner',
      discordDisplayName: 'Owner',
      initials: 'OW',
      discordAccountId: '123456789012345678',
    },
    workspaces: [
      {
        id: 'team-1',
        name: 'Destiled',
        description: '',
        archived: false,
        members: [
          {
            id: 'owner-app-id',
            displayName: 'Owner',
            initials: 'OW',
            role: 'owner',
            state: 'online',
            discordAccountId: '123456789012345678',
          },
        ],
        characters: [
          {
            id: 'char-1',
            name: 'KuzynPasek',
            characterClass: 'warrior',
            skillPath: defaultSkillPathForClass('warrior'),
            appearanceLook: DEFAULT_APPEARANCE_LOOK,
            gender: 'male',
            level: 80,
            responsibleMemberId: 'owner-app-id',
            note: '',
            imagePath: null,
            sets: [],
            activeSetId: '',
            revision: 1,
            archived: false,
          },
        ],
        items: [],
        timers: [legacyCurseBookTimer],
        tasks: [],
        notes: [],
        history: [],
        invitations: [],
        revision: 1,
        updatedLabel: 'teraz',
      },
    ],
    pendingIncomingInvitations: [],
    lastOpenedWorkspaceId: 'team-1',
    lastOpenedCharacterId: 'char-1',
    intendedDestination: null,
    seededDemo: false,
  };
}

describe('skill-book timer regression', () => {
  it('adds Księga umiejętności even when an unrelated Księga label already exists', () => {
    const next = addProgressionTimer(stateWithLegacyBook(), 'team-1', 'char-1', {
      kind: 'skill_book',
    });
    const timers = next.workspaces[0]?.timers ?? [];

    expect(timers).toHaveLength(2);
    expect(timers.some((timer) => timer.kind === 'skill_book')).toBe(true);
    expect(timers.some((timer) => timer.label === 'Księga Klątw')).toBe(true);
  });
});
