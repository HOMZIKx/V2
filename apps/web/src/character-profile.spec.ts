import { describe, expect, it } from 'vitest';

import {
  buildSaveCharacterProfileCommand,
  getApprovedCharacterRender,
  newCharacterProfileFixture,
  validateCharacterProfile,
} from './character-profile.js';

describe('character profile view model', () => {
  it('keeps unsupported visual variants honest instead of substituting another class', () => {
    expect(getApprovedCharacterRender('sura', 'male')).toBe('/game/classes/sura-male.png');
    expect(getApprovedCharacterRender('warrior', 'female')).toBeNull();
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
