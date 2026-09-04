import { projectHardProductFacts } from './project-hard-progression';

export type CharacterClass = 'warrior' | 'sura' | 'ninja' | 'shaman';
export type CharacterGender = 'male' | 'female';

/** Metin2 skill trees / second class choice. */
export type CharacterSkillPath =
  | 'warrior_body'
  | 'warrior_mental'
  | 'sura_weapon'
  | 'sura_magic'
  | 'ninja_blade'
  | 'ninja_archery'
  | 'shaman_dragon'
  | 'shaman_heal';

/** Official costume showcase lines (class×gender frames from en-wiki). */
export type CharacterAppearanceLook = 'desert' | 'black-desert' | 'azrael' | 'ice-dragon';

export const characterAppearanceLooks: readonly {
  readonly id: CharacterAppearanceLook;
  readonly label: string;
}[] = [
  { id: 'desert', label: 'Desert Warrior' },
  { id: 'black-desert', label: 'Black Desert' },
  { id: 'azrael', label: "Azrael's Armour" },
  { id: 'ice-dragon', label: 'Ice Dragon Guard' },
];

export const DEFAULT_APPEARANCE_LOOK: CharacterAppearanceLook = 'desert';

export function isCharacterAppearanceLook(value: string): value is CharacterAppearanceLook {
  return characterAppearanceLooks.some((look) => look.id === value);
}

export interface CharacterProfileDraft {
  readonly name: string;
  readonly characterClass: CharacterClass;
  readonly skillPath: CharacterSkillPath;
  readonly appearanceLook: CharacterAppearanceLook;
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

export const characterSkillPathLabels: Record<CharacterSkillPath, string> = {
  warrior_body: 'Body',
  warrior_mental: 'Mental',
  sura_weapon: 'WP',
  sura_magic: 'BM',
  ninja_blade: 'Ostrze',
  ninja_archery: 'Łuk',
  shaman_dragon: 'Smok',
  shaman_heal: 'Leczenie',
};

export const characterSkillPathsByClass: Record<
  CharacterClass,
  readonly CharacterSkillPath[]
> = {
  warrior: ['warrior_body', 'warrior_mental'],
  sura: ['sura_weapon', 'sura_magic'],
  ninja: ['ninja_blade', 'ninja_archery'],
  shaman: ['shaman_dragon', 'shaman_heal'],
};

export function defaultSkillPathForClass(characterClass: CharacterClass): CharacterSkillPath {
  return characterSkillPathsByClass[characterClass][0]!;
}

export function isSkillPathForClass(
  characterClass: CharacterClass,
  skillPath: CharacterSkillPath,
): boolean {
  return characterSkillPathsByClass[characterClass].includes(skillPath);
}

export function formatCharacterClassLine(
  characterClass: CharacterClass,
  skillPath: CharacterSkillPath | null | undefined,
  gender?: CharacterGender,
): string {
  const classLabel = characterClassLabels[characterClass];
  const path =
    skillPath && isSkillPathForClass(characterClass, skillPath)
      ? characterSkillPathLabels[skillPath]
      : null;
  const genderLabel = gender ? characterGenderLabels[gender] : null;
  return [classLabel, path, genderLabel].filter(Boolean).join(' · ');
}

const approvedRenderPaths: Readonly<Record<`${CharacterClass}-${CharacterGender}`, string>> = {
  'warrior-male': '/game/classes/warrior-male.png',
  'warrior-female': '/game/classes/warrior-female.png',
  'sura-male': '/game/classes/sura-male.png',
  'sura-female': '/game/classes/sura-female.png',
  'ninja-male': '/game/classes/ninja-male.png',
  'ninja-female': '/game/classes/ninja-female.png',
  'shaman-male': '/game/classes/shaman-male.png',
  'shaman-female': '/game/classes/shaman-female.png',
};

/** All class×gender pairs for Metin2-correct character cards (D-047 / DEC-062). */
export const allCharacterRenderKeys: readonly `${CharacterClass}-${CharacterGender}`[] = [
  'warrior-male',
  'warrior-female',
  'sura-male',
  'sura-female',
  'ninja-male',
  'ninja-female',
  'shaman-male',
  'shaman-female',
];

export function listMissingCharacterRenders(): readonly `${CharacterClass}-${CharacterGender}`[] {
  return allCharacterRenderKeys.filter((key) => approvedRenderPaths[key] === undefined);
}

export function getApprovedCharacterRender(
  characterClass: CharacterClass,
  gender: CharacterGender,
  appearanceLook: CharacterAppearanceLook = DEFAULT_APPEARANCE_LOOK,
): string | null {
  const key = `${characterClass}-${gender}` as const;
  if (appearanceLook === 'desert') {
    return approvedRenderPaths[key] ?? null;
  }
  if (!isCharacterAppearanceLook(appearanceLook)) {
    return approvedRenderPaths[key] ?? null;
  }
  return `/game/classes/looks/${appearanceLook}/${characterClass}-${gender}.png`;
}

export function characterAppearanceLabel(look: CharacterAppearanceLook): string {
  return characterAppearanceLooks.find((entry) => entry.id === look)?.label ?? look;
}

export function validateCharacterProfile(draft: CharacterProfileDraft): CharacterProfileValidation {
  const errors: Partial<Record<keyof CharacterProfileDraft, string>> = {};
  const name = draft.name.trim();
  const setName = draft.startingSetName.trim();

  if (name.length < 2) errors.name = 'Wpisz co najmniej 2 znaki.';
  if (name.length > 24) errors.name = 'Nazwa może mieć maksymalnie 24 znaki.';
  if (
    draft.level !== null &&
    (!Number.isInteger(draft.level) ||
      draft.level < 1 ||
      draft.level > projectHardProductFacts.maxCharacterLevel)
  ) {
    errors.level = `Poziom musi być liczbą od 1 do ${projectHardProductFacts.maxCharacterLevel} albo pozostać pusty.`;
  }
  if (draft.responsibleMemberId.trim().length === 0) {
    errors.responsibleMemberId = 'Wybierz osobę prowadzącą postać.';
  }
  if (!isSkillPathForClass(draft.characterClass, draft.skillPath)) {
    errors.skillPath = 'Wybierz ścieżkę zgodną z klasą postaci.';
  }
  if (!isCharacterAppearanceLook(draft.appearanceLook)) {
    errors.appearanceLook = 'Wybierz wygląd postaci.';
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
    skillPath: 'sura_weapon',
    appearanceLook: 'desert',
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
    skillPath: 'sura_magic',
    appearanceLook: 'black-desert',
    gender: 'male',
    level: 75,
    responsibleMemberId: 'mateusz',
    startingSetName: 'Wojna',
    teamNote: 'Główna postać zespołu do prowadzenia setów na wojnę i dungeon.',
  },
};

export function getEditCharacterProfileFixture(
  characterId: string,
): CharacterProfileSnapshot | null {
  const profiles: Readonly<Record<string, CharacterProfileSnapshot>> = {
    nerwnicht: editCharacterProfileFixture,
    aalpsik: {
      ...editCharacterProfileFixture,
      characterId: 'aalpsik',
      characterRevision: 4,
      draft: {
        name: 'Aalpsik',
        characterClass: 'ninja',
        skillPath: 'ninja_blade',
        appearanceLook: 'azrael',
        gender: 'female',
        level: 55,
        responsibleMemberId: 'aalpsik',
        startingSetName: 'Loch',
        teamNote: 'Postać zespołowa do dungeonów.',
      },
    },
    kimmizic: {
      ...editCharacterProfileFixture,
      characterId: 'kimmizic',
      characterRevision: 3,
      draft: {
        name: 'Kimmizic',
        characterClass: 'shaman',
        skillPath: 'shaman_heal',
        appearanceLook: 'ice-dragon',
        gender: 'male',
        level: 61,
        responsibleMemberId: 'wicek',
        startingSetName: 'Wsparcie',
        teamNote: 'Postać wsparcia zespołu.',
      },
    },
    xiaohu: {
      ...editCharacterProfileFixture,
      characterId: 'xiaohu',
      characterRevision: 2,
      draft: {
        name: 'XiaoHu',
        characterClass: 'warrior',
        skillPath: 'warrior_body',
        appearanceLook: 'desert',
        gender: 'male',
        level: 68,
        responsibleMemberId: 'xiaohu',
        startingSetName: 'Wojna',
        teamNote: 'Wojownik zespołu.',
      },
    },
  };
  return profiles[characterId] ?? null;
}
