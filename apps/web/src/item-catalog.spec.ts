import { describe, expect, it } from 'vitest';

import {
  bonusesAtEnhancement,
  clampEnhancement,
  compatibleClassesForCategory,
  enhancerCatalogItems,
  equipmentCatalogItems,
  equipmentSlotForCategory,
  findGameItemByTitle,
  formatEnhancedItemName,
  isItemCompatibleWithClass,
  knownCatalogBonusNames,
  parseEnhancementFromName,
  resolveItemBonuses,
  resolveItemIconPath,
  stripEnhancementFromName,
} from './item-catalog.js';

describe('item catalog class and enhancement rules', () => {
  it('maps class-tagged weapons and rejects amulet upgraders from EQ slots', () => {
    expect(equipmentSlotForCategory('Ekwipunek — Ninja — Sztylety')).toBe('weapon');
    expect(equipmentSlotForCategory('Ekwipunek — Sura — Zbroje')).toBe('armor');
    expect(equipmentSlotForCategory('Ulepszacze')).toBeNull();
    expect(equipmentSlotForCategory('Kamienie duszy — Broń')).toBeNull();
    expect(compatibleClassesForCategory('Ekwipunek — Ninja — Sztylety')).toEqual(['ninja']);
    expect(
      compatibleClassesForCategory('Ekwipunek — Sura — Bronie jednoręczne (tylko Sura)'),
    ).toEqual(['sura']);
    expect(compatibleClassesForCategory('Ekwipunek — Tarcze')).toBe('any');
    expect(compatibleClassesForCategory('Ulepszacze')).toBe('none');
  });

  it('allows shared one-handed swords on Warrior, Ninja and Sura (Gameforge wiki)', () => {
    const shared = 'Ekwipunek — Wojownik — Bronie jednoręczne';
    expect(compatibleClassesForCategory(shared)).toEqual(['warrior', 'ninja', 'sura']);
    expect(isItemCompatibleWithClass(shared, 'sura')).toBe(true);
    expect(isItemCompatibleWithClass(shared, 'ninja')).toBe(true);
    expect(isItemCompatibleWithClass(shared, 'warrior')).toBe(true);
    expect(isItemCompatibleWithClass(shared, 'shaman')).toBe(false);
    expect(isItemCompatibleWithClass('Ekwipunek — Wojownik — Bronie dwuręczne', 'sura')).toBe(
      false,
    );
    expect(isItemCompatibleWithClass('Ekwipunek — Ninja — Sztylety', 'sura')).toBe(false);
    expect(isItemCompatibleWithClass('Ekwipunek — Ninja — Sztylety', 'ninja')).toBe(true);
    expect(isItemCompatibleWithClass('Ekwipunek — Kolczyki', 'shaman')).toBe(true);
  });

  it('formats enhancement levels from 0 to 9', () => {
    expect(parseEnhancementFromName('Krótki Nóż +9')).toBe(9);
    expect(stripEnhancementFromName('Krótki Nóż +9')).toBe('Krótki Nóż');
    expect(formatEnhancedItemName('Krótki Nóż', 0)).toBe('Krótki Nóż +0');
    expect(clampEnhancement(99)).toBe(9);
    expect(formatEnhancedItemName('Bojowa Tarcza +3', 7)).toBe('Bojowa Tarcza +7');
  });

  it('reads bonus ladders from dobry-temat wiki_upgrade without inventing truncated rows', () => {
    const shield = findGameItemByTitle('Bojowa Tarcza');
    expect(bonusesAtEnhancement(shield?.upgradeDescription, 9)).toContain('Obrona +57');
    expect(
      bonusesAtEnhancement(shield?.upgradeDescription, 9).some((line) => line.includes('…')),
    ).toBe(false);
    expect(resolveItemBonuses('Krwawy Hełm', 9)).toContain('Obrona +41');
    expect(resolveItemBonuses('Bambusowe Buty', 9)).toContain('Szybkość ruchu +15%');
    expect(enhancerCatalogItems().length).toBeGreaterThan(100);
    expect(
      enhancerCatalogItems('Amulet Orka').some((item) => item.title.includes('Amulet Orka')),
    ).toBe(true);
  });

  it('filters equipment catalog by character class', () => {
    const ninjaWeapons = equipmentCatalogItems({ characterClass: 'ninja', slot: 'weapon' });
    expect(ninjaWeapons.some((item) => item.title === 'Krótki Nóż')).toBe(true);
    expect(ninjaWeapons.some((item) => item.title === 'Zatruty Miecz')).toBe(true);
    expect(ninjaWeapons.some((item) => item.title === 'Demoniczne Ostrze')).toBe(false);
    const suraWeapons = equipmentCatalogItems({ characterClass: 'sura', slot: 'weapon' });
    expect(suraWeapons.some((item) => item.title === 'Zatruty Miecz')).toBe(true);
    expect(suraWeapons.some((item) => item.title === 'Demoniczne Ostrze')).toBe(true);
    expect(equipmentCatalogItems().every((item) => equipmentSlotForCategory(item.category))).toBe(
      true,
    );
  });

  it('resolves Gameforge wiki icons for catalog EQ and shared swords', () => {
    const poisoned = findGameItemByTitle('Zatruty Miecz');
    expect(poisoned?.sourceImageUrl).toMatch(/^\/game\/items\//u);
    expect(resolveItemIconPath('Zatruty Miecz +8')).not.toBe('/game/items/short-knife.svg');
    expect(resolveItemIconPath('Bojowa Tarcza +9')).toMatch(/\/game\/items\//u);
    expect(
      equipmentCatalogItems().every(
        (item) => item.sourceImageUrl !== null && item.sourceImageUrl.length > 0,
      ),
    ).toBe(true);
  });

  it('exposes only non-truncated bonus names from the dump and reads shield ladders', () => {
    const names = knownCatalogBonusNames();
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((name) => !name.includes('…'))).toBe(true);
    const shield = findGameItemByTitle('Bojowa Tarcza');
    expect(bonusesAtEnhancement(shield?.upgradeDescription, 9).some((line) => line.includes('Obrona'))).toBe(
      true,
    );
    expect(resolveItemBonuses('Bojowa Tarcza +9', 9).length).toBeGreaterThan(0);
  });
});
