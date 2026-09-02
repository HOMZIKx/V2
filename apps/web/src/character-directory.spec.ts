import { describe, expect, it } from 'vitest';

import {
  characterDirectoryFixture,
  emptyCharacterDirectoryFixture,
  filterAccessibleCharacters,
  getCharacterDirectorySummary,
} from './character-directory.js';

describe('character directory view model', () => {
  it('summarizes only characters the account can access', () => {
    expect(getCharacterDirectorySummary(characterDirectoryFixture)).toEqual({
      total: 3,
      responsible: 1,
      attention: 2,
      readyTimers: 2,
    });
  });

  it('supports a valid empty state for accounts without character access', () => {
    expect(getCharacterDirectorySummary(emptyCharacterDirectoryFixture)).toEqual({
      total: 0,
      responsible: 0,
      attention: 0,
      readyTimers: 0,
    });
  });

  it('filters by responsibility without treating team-shared characters as owned', () => {
    const result = filterAccessibleCharacters(characterDirectoryFixture.characters, '', 'mine');

    expect(result.map((character) => character.name)).toEqual(['NerwNicht']);
  });

  it('searches across character, class, team and responsible member', () => {
    const result = filterAccessibleCharacters(characterDirectoryFixture.characters, 'Wicek', 'all');

    expect(result.map((character) => character.name)).toEqual(['Kimmizic']);
  });
});
