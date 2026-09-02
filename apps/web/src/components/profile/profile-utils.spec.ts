import { describe, expect, it } from 'vitest';

import type { IdentityProfileDto } from '../../lib/lfg-api';
import { groupCharactersByAccount, resolveActiveCharacter } from './profile-utils';

describe('profile-utils', () => {
  const profile: IdentityProfileDto = {
    userId: 'u1',
    activeCharacterId: 'c2',
    gameAccounts: [
      { id: 'acc-main', displayName: 'MAIN', displayOrder: 0, characterCount: 2 },
      { id: 'acc-drop', displayName: 'DROP', displayOrder: 1, characterCount: 1 },
    ],
    characters: [
      {
        id: 'c1',
        nickname: 'Yodasz',
        classSpecKey: 'warrior_body',
        gameAccountId: 'acc-main',
        partyRoles: ['DPS'],
      },
      {
        id: 'c2',
        nickname: 'Czatorianka',
        classSpecKey: 'shaman_dragon',
        gameAccountId: 'acc-main',
        partyRoles: ['BUFF'],
        isDefault: true,
      },
      {
        id: 'c3',
        nickname: 'Drop1',
        classSpecKey: 'warrior_mental',
        gameAccountId: 'acc-drop',
        partyRoles: ['DPS'],
      },
    ],
  };

  it('resolves active character from activeCharacterId', () => {
    expect(resolveActiveCharacter(profile)?.id).toBe('c2');
  });

  it('groups characters by game account', () => {
    const groups = groupCharactersByAccount(profile);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.account?.displayName).toBe('MAIN');
    expect(groups[0]?.characters).toHaveLength(2);
    expect(groups[1]?.characters[0]?.nickname).toBe('Drop1');
  });
});
