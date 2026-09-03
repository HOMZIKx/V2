import { describe, expect, it } from 'vitest';

import {
  buildSaveCharacterProfileCommand,
  getApprovedCharacterRender,
  listMissingCharacterRenders,
  newCharacterProfileFixture,
  validateCharacterProfile,
} from './character-profile.js';

describe('character profile view model', () => {
  it('keeps unsupported visual variants honest instead of substituting another class', () => {
    expect(getApprovedCharacterRender('sura', 'male')).toBe('/game/classes/sura-male.png');
    expect(getApprovedCharacterRender('ninja', 'female')).toBe('/game/classes/ninja-female.png');
    expect(getApprovedCharacterRender('shaman', 'male')).toBe('/game/classes/shaman-male.png');
    expect(getApprovedCharacterRender('warrior', 'female')).toBeNull();
    expect(getApprovedCharacterRender('sura', 'female')).toBeNull();
    expect(listMissingCharacterRenders()).toEqual(
      expect.arrayContaining([
        'warrior-male',
        'warrior-female',
        'sura-female',
        'ninja-male',
        'shaman-female',
      ]),
    );
  });

  it('allows an unknown level but rejects impossible or malformed values', () => {
    expect(
      validateCharacterProfile({ ...newCharacterProfileFixture.draft, name: 'Nowa' }).valid,
    ).toBe(true);
    expect(
      validateCharacterProfile({ ...newCharacterProfileFixture.draft, name: 'Nowa', level: 0 })
        .errors.level,
    ).toContain('1 do 999');
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
