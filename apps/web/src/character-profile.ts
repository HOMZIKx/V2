export type CharacterClass = 'warrior' | 'sura' | 'ninja' | 'shaman';
export type CharacterGender = 'male' | 'female';

export interface CharacterProfileDraft {
  readonly name: string;
  readonly characterClass: CharacterClass;
  readonly gender: CharacterGender;
  readonly level: number | null;
  readonly responsibleMemberId: string;
  readonly startingSetName: string;
  readonly teamNote: string;
}

export interface CharacterProfileMemberOption {
  readonly id: string;
  readonly displayName: string;
}

export interface CharacterProfileSnapshot {
  readonly viewerName: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly teamRevision: number;
  readonly characterId: string | null;
  readonly characterRevision: number | null;
  readonly members: readonly CharacterProfileMemberOption[];
  readonly draft: CharacterProfileDraft;
}

export interface CharacterProfileValidation {
  readonly valid: boolean;
  readonly errors: Readonly<Partial<Record<keyof CharacterProfileDraft, string>>>;
}

export interface SaveCharacterProfileCommand {
  readonly teamId: string;
  readonly characterId: string | null;
  readonly expectedTeamRevision: number;
  readonly expectedCharacterRevision: number | null;
  readonly operationId: string;
  readonly profile: CharacterProfileDraft;
}

export interface CharacterProfileAdapter {
  saveProfile(command: SaveCharacterProfileCommand): Promise<{
    readonly characterId: string;
    readonly teamRevision: number;
    readonly characterRevision: number;
  }>;
}

export const characterClassLabels: Record<CharacterClass, string> = {
  warrior: 'Wojownik',
  sura: 'Sura',
  ninja: 'Ninja',
  shaman: 'Szaman',
};

export const characterGenderLabels: Record<CharacterGender, string> = {
  male: 'Mężczyzna',
  female: 'Kobieta',
};

const approvedRenderPaths: Readonly<
  Partial<Record<`${CharacterClass}-${CharacterGender}`, string>>
> = {
  'sura-male': '/game/classes/sura-male.png',
  'ninja-female': '/game/classes/ninja-female.png',
  'shaman-male': '/game/classes/shaman-male.png',
};

export function getApprovedCharacterRender(
  characterClass: CharacterClass,
  gender: CharacterGender,
): string | null {
  return approvedRenderPaths[`${characterClass}-${gender}`] ?? null;
}

export function validateCharacterProfile(draft: CharacterProfileDraft): CharacterProfileValidation {
  const errors: Partial<Record<keyof CharacterProfileDraft, string>> = {};
  const name = draft.name.trim();
  const setName = draft.startingSetName.trim();

  if (name.length < 2) errors.name = 'Wpisz co najmniej 2 znaki.';
  if (name.length > 24) errors.name = 'Nazwa może mieć maksymalnie 24 znaki.';
  if (
    draft.level !== null &&
    (!Number.isInteger(draft.level) || draft.level < 1 || draft.level > 999)
  ) {
    errors.level = 'Poziom musi być liczbą od 1 do 999 albo pozostać pusty.';
  }
  if (draft.responsibleMemberId.trim().length === 0) {
    errors.responsibleMemberId = 'Wybierz osobę prowadzącą postać.';
  }
  if (setName.length > 0 && setName.length < 2) {
    errors.startingSetName = 'Nazwa zestawu może być pusta albo mieć min. 2 znaki.';
  }
  if (setName.length > 32) {
    errors.startingSetName = 'Nazwa zestawu może mieć maksymalnie 32 znaki.';
  }
  if (draft.teamNote.trim().length > 280) {
    errors.teamNote = 'Notatka może mieć maksymalnie 280 znaków.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function buildSaveCharacterProfileCommand(
  snapshot: CharacterProfileSnapshot,
  draft: CharacterProfileDraft,
  operationId: string,
): SaveCharacterProfileCommand {
  const validation = validateCharacterProfile(draft);
  if (!validation.valid) throw new Error('Character profile is invalid');
  if (operationId.trim().length === 0) throw new Error('operationId is required');

  return {
    teamId: snapshot.teamId,
    characterId: snapshot.characterId,
    expectedTeamRevision: snapshot.teamRevision,
    expectedCharacterRevision: snapshot.characterRevision,
    operationId,
    profile: {
      ...draft,
      name: draft.name.trim(),
      startingSetName: draft.startingSetName.trim(),
      teamNote: draft.teamNote.trim(),
    },
  };
}

const members: readonly CharacterProfileMemberOption[] = [
  { id: 'mateusz', displayName: 'Mateusz' },
  { id: 'xiaohu', displayName: 'XiaoHu' },
  { id: 'wicek', displayName: 'Wicek' },
  { id: 'aalpsik', displayName: 'Aalpsik' },
];

export const newCharacterProfileFixture: CharacterProfileSnapshot = {
  viewerName: 'Mateusz',
  teamId: 'asteria',
  teamName: 'Asteria',
  teamRevision: 19,
  characterId: null,
  characterRevision: null,
  members,
  draft: {
    name: '',
    characterClass: 'sura',
    gender: 'male',
    level: null,
    responsibleMemberId: 'mateusz',
    startingSetName: 'Główny',
    teamNote: '',
  },
};

export const editCharacterProfileFixture: CharacterProfileSnapshot = {
  ...newCharacterProfileFixture,
  characterId: 'nerwnicht',
  characterRevision: 7,
  draft: {
    name: 'NerwNicht',
    characterClass: 'sura',
    gender: 'male',
    level: 75,
    responsibleMemberId: 'mateusz',
    startingSetName: 'Wojna',
    teamNote: 'Główna postać zespołu do prowadzenia setów na wojnę i dungeon.',
  },
};

export function getEditCharacterProfileFixture(characterId: string): CharacterProfileSnapshot | null {
  const profiles: Readonly<Record<string, CharacterProfileSnapshot>> = {
    nerwnicht: editCharacterProfileFixture,
    aalpsik: {
      ...editCharacterProfileFixture,
      characterId: 'aalpsik', characterRevision: 4,
      draft: { name: 'Aalpsik', characterClass: 'ninja', gender: 'female', level: 55, responsibleMemberId: 'aalpsik', startingSetName: 'Dungeon', teamNote: 'Postać zespołowa do dungeonów.' },
    },
    kimmizic: {
      ...editCharacterProfileFixture,
      characterId: 'kimmizic', characterRevision: 3,
      draft: { name: 'Kimmizic', characterClass: 'shaman', gender: 'male', level: 61, responsibleMemberId: 'wicek', startingSetName: 'Wsparcie', teamNote: 'Postać wsparcia zespołu.' },
    },
  };
  return profiles[characterId] ?? null;
}
