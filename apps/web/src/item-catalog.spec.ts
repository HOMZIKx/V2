import { describe, expect, it } from 'vitest';

import type { CharacterClass } from './character-profile.js';
import {
  clampEnhancement,
  compatibleClassesForCategory,
  equipmentCatalogItems,
  equipmentSlotForCategory,
  formatEnhancedItemName,
  isItemCompatibleWithClass,
  parseEnhancementFromName,
  stripEnhancementFromName,
} from './item-catalog.js';

describe('item catalog class and enhancement rules', () => {
  it('maps class-tagged weapons and rejects amulet upgraders from EQ slots', () => {
    expect(equipmentSlotForCategory('Ekwipunek — Ninja — Sztylety')).toBe('weapon');
    expect(equipmentSlotForCategory('Ekwipunek — Sura — Zbroje')).toBe('armor');
    expect(equipmentSlotForCategory('Ulepszacze')).toBeNull();
    expect(compatibleClassesForCategory('Ekwipunek — Ninja — Sztylety')).toEqual(['ninja']);
    expect(
      compatibleClassesForCategory('Ekwipunek — Sura — Bronie jednoręczne (tylko Sura)'),
    ).toEqual(['sura']);
    expect(compatibleClassesForCategory('Ekwipunek — Tarcze')).toBe('any');
    expect(compatibleClassesForCategory('Ulepszacze')).toBe('none');
  });

  it('blocks ninja daggers on Sura and warrior swords on Ninja', () => {
    expect(isItemCompatibleWithClass('Ekwipunek — Ninja — Sztylety', 'sura')).toBe(false);
    expect(isItemCompatibleWithClass('Ekwipunek — Ninja — Sztylety', 'ninja')).toBe(true);
    expect(isItemCompatibleWithClass('Ekwipunek — Wojownik — Bronie jednoręczne', 'sura')).toBe(
      false,
    );
    expect(isItemCompatibleWithClass('Ekwipunek — Kolczyki', 'shaman' as CharacterClass)).toBe(
      true,
    );
  });

  it('formats enhancement levels from 0 to 9', () => {
    expect(parseEnhancementFromName('Krótki Nóż +9')).toBe(9);
    expect(stripEnhancementFromName('Krótki Nóż +9')).toBe('Krótki Nóż');
    expect(formatEnhancedItemName('Krótki Nóż', 0)).toBe('Krótki Nóż +0');
    expect(clampEnhancement(99)).toBe(9);
    expect(formatEnhancedItemName('Bojowa Tarcza +3', 7)).toBe('Bojowa Tarcza +7');
  });

  it('filters equipment catalog by character class', () => {
    const ninjaWeapons = equipmentCatalogItems({ characterClass: 'ninja', slot: 'weapon' });
    expect(ninjaWeapons.some((item) => item.title === 'Krótki Nóż')).toBe(true);
    expect(ninjaWeapons.some((item) => item.title === 'Demoniczne Ostrze')).toBe(false);
    expect(equipmentCatalogItems().every((item) => equipmentSlotForCategory(item.category))).toBe(
      true,
    );
  });
});
