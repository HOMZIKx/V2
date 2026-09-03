import { describe, expect, it } from 'vitest';

import {
  buildSaveCharacterProfileCommand,
  getApprovedCharacterRender,
  listMissingCharacterRenders,
  newCharacterProfileFixture,
  validateCharacterProfile,
} from './character-profile.js';

describe('character profile view model', () => {
  it('registers Metin2 class×gender renders for every combination', () => {
    expect(getApprovedCharacterRender('sura', 'male')).toBe('/game/classes/sura-male.png');
    expect(getApprovedCharacterRender('ninja', 'female')).toBe('/game/classes/ninja-female.png');
    expect(getApprovedCharacterRender('shaman', 'male')).toBe('/game/classes/shaman-male.png');
    expect(getApprovedCharacterRender('warrior', 'female')).toBe(
      '/game/classes/warrior-female.png',
    );
    expect(getApprovedCharacterRender('sura', 'female')).toBe('/game/classes/sura-female.png');
    expect(getApprovedCharacterRender('ninja', 'male')).toBe('/game/classes/ninja-male.png');
    expect(getApprovedCharacterRender('shaman', 'female')).toBe('/game/classes/shaman-female.png');
    expect(getApprovedCharacterRender('warrior', 'male')).toBe('/game/classes/warrior-male.png');
    expect(listMissingCharacterRenders()).toEqual([]);
  });

  it('allows an unknown level but rejects impossible or malformed values', () => {
    expect(
      validateCharacterProfile({ ...newCharacterProfileFixture.draft, name: 'Nowa' }).valid,
    ).toBe(true);
    expect(
      validateCharacterProfile({ ...newCharacterProfileFixture.draft, name: 'Nowa', level: 0 })
        .errors.level,
    ).toContain(`1 do ${99}`);
  });

  it('normalizes fields and preserves optimistic revisions in the save command', () => {
    expect(
      buildSaveCharacterProfileCommand(
        newCharacterProfileFixture,
        {
          ...newCharacterProfileFixture.draft,
          name: '  NowaSura  ',
          teamNote: '  pod exp  ',
        },
        'op-character-1',
      ),
    ).toMatchObject({
      characterId: null,
      expectedTeamRevision: 19,
      expectedCharacterRevision: null,
      operationId: 'op-character-1',
      profile: { name: 'NowaSura', teamNote: 'pod exp' },
    });
  });
});
