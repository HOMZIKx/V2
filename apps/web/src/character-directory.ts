import { teamWorkspaceFixture, type WorkspaceCharacter } from './team-workspace';

export type CharacterDirectoryScope = 'all' | 'mine' | 'attention';

export interface AccessibleCharacter extends WorkspaceCharacter {
  readonly teamId: string;
  readonly teamName: string;
  readonly access: 'responsible' | 'team_shared';
  readonly detailHref: string;
  readonly detailLabel: string;
}

export interface CharacterDirectorySnapshot {
  readonly viewerName: string;
  readonly characters: readonly AccessibleCharacter[];
  readonly canCreateCharacter: boolean;
  readonly createHref: string | null;
}

export interface CharacterDirectorySummary {
  readonly total: number;
  readonly responsible: number;
  readonly attention: number;
  readonly readyTimers: number;
}

export const characterDirectoryFixture: CharacterDirectorySnapshot = {
  viewerName: teamWorkspaceFixture.viewerName,
  canCreateCharacter: true,
  createHref: '/teams/asteria/characters/new',
  characters: teamWorkspaceFixture.characters.map((character) => ({
    ...character,
    teamId: 'asteria',
    teamName: teamWorkspaceFixture.teamName,
    access:
      character.responsibleMember === teamWorkspaceFixture.viewerName
        ? 'responsible'
        : 'team_shared',
    detailHref: `/teams/asteria/characters/${character.id}`,
    detailLabel: 'Otwórz kartę postaci',
  })),
};

export const emptyCharacterDirectoryFixture: CharacterDirectorySnapshot = {
  viewerName: 'Nowy gracz',
  characters: [],
  canCreateCharacter: false,
  createHref: null,
};

export function getCharacterDirectorySummary(
  snapshot: CharacterDirectorySnapshot,
): CharacterDirectorySummary {
  return {
    total: snapshot.characters.length,
    responsible: snapshot.characters.filter((character) => character.access === 'responsible')
      .length,
    attention: snapshot.characters.filter(
      (character) => character.equipmentConfirmed < character.equipmentCapacity,
    ).length,
    readyTimers: snapshot.characters.reduce((sum, character) => sum + character.readyTimers, 0),
  };
}

export function filterAccessibleCharacters(
  characters: readonly AccessibleCharacter[],
  query: string,
  scope: CharacterDirectoryScope,
): readonly AccessibleCharacter[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('pl');

  return characters.filter((character) => {
    const queryMatches =
      normalizedQuery.length === 0 ||
      character.name.toLocaleLowerCase('pl').includes(normalizedQuery) ||
      character.classLabel.toLocaleLowerCase('pl').includes(normalizedQuery) ||
      character.teamName.toLocaleLowerCase('pl').includes(normalizedQuery) ||
      character.responsibleMember.toLocaleLowerCase('pl').includes(normalizedQuery);
    const scopeMatches =
      scope === 'all' ||
      (scope === 'mine' && character.access === 'responsible') ||
      (scope === 'attention' &&
        (character.readyTimers > 0 || character.equipmentConfirmed < character.equipmentCapacity));

    return queryMatches && scopeMatches;
  });
}
