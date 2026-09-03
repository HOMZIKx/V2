import type { CharacterClass, CharacterGender } from '../character-profile';

const CLASS_SPEC_TO_PRESENTATION: Readonly<
  Record<string, { readonly characterClass: CharacterClass; readonly gender: CharacterGender }>
> = {
  warrior_body: { characterClass: 'warrior', gender: 'male' },
  warrior_mental: { characterClass: 'warrior', gender: 'female' },
  ninja_blade: { characterClass: 'ninja', gender: 'male' },
  ninja_dagger: { characterClass: 'ninja', gender: 'female' },
  sura_weapon: { characterClass: 'sura', gender: 'male' },
  sura_magic: { characterClass: 'sura', gender: 'female' },
  shaman_dragon: { characterClass: 'shaman', gender: 'male' },
  shaman_heal: { characterClass: 'shaman', gender: 'female' },
};

const PRESENTATION_TO_CLASS_SPEC: Readonly<Record<`${CharacterClass}-${CharacterGender}`, string>> =
  {
    'warrior-male': 'warrior_body',
    'warrior-female': 'warrior_mental',
    'ninja-male': 'ninja_blade',
    'ninja-female': 'ninja_dagger',
    'sura-male': 'sura_weapon',
    'sura-female': 'sura_magic',
    'shaman-male': 'shaman_dragon',
    'shaman-female': 'shaman_heal',
  };

export function toClassSpecKey(characterClass: CharacterClass, gender: CharacterGender): string {
  return PRESENTATION_TO_CLASS_SPEC[`${characterClass}-${gender}`];
}

export function fromClassSpecKey(classSpecKey: string): {
  readonly characterClass: CharacterClass;
  readonly gender: CharacterGender;
} {
  const mapped = CLASS_SPEC_TO_PRESENTATION[classSpecKey];
  if (mapped === undefined) {
    return { characterClass: 'warrior', gender: 'male' };
  }
  return mapped;
}
