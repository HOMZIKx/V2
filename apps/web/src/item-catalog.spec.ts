import { describe, expect, it } from 'vitest';

import {
  bonusesAtEnhancement,
  additionalBonusOptionsForSlot,
  additionalBonusOptionsForItem,
  maxAdditionalBonusesForItem,
  catalogBonusEntriesForItem,
  splitItemBonuses,
  weaponHasAverageSkillDamage,
  weaponHasPhPvmAttackBonuses,
  weaponRequiredLevel,
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
  phPlus9Lines,
  phRequiredLevel,
  resolveItemBonuses,
  resolveItemIconPath,
  searchEquipmentCatalogSuggestions,
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
    expect(bonusesAtEnhancement(shield?.upgradeDescription, 9)).toContain('Szybkość ruchu -2%');
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

  it('finds EQ items across classes and abbreviated wiki titles', () => {
    const bySteel = searchEquipmentCatalogSuggestions('czarna stal', {
      characterClass: 'warrior',
      limit: 30,
    });
    expect(bySteel.some((item) => item.title === 'Zbroja Z Czarnej Stali')).toBe(true);

    const byCzar = searchEquipmentCatalogSuggestions('czar', {
      characterClass: 'warrior',
      limit: 30,
    });
    expect(byCzar.some((item) => item.title === 'Zbroja Z Czarnej Stali')).toBe(true);
    expect(byCzar.some((item) => item.title === 'Czarna Szata')).toBe(true);
    expect(byCzar.some((item) => item.title === 'Zbr. Płyt. Czar. Magii')).toBe(true);
    expect(byCzar.findIndex((item) => item.title === 'Zbroja Z Czarnej Stali')).toBeLessThan(
      byCzar.findIndex((item) => item.title === 'Czarna Szata'),
    );

    const abbreviated = searchEquipmentCatalogSuggestions('czar mag', { limit: 20 });
    expect(abbreviated.some((item) => item.title.includes('Czar. Magii'))).toBe(true);
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
    expect(
      bonusesAtEnhancement(shield?.upgradeDescription, 9).some((line) => line.includes('Obrona')),
    ).toBe(true);
    expect(resolveItemBonuses('Bojowa Tarcza +9', 9).length).toBeGreaterThan(0);
  });

  it('exposes only this item’s bonus values, never a global name-only list', () => {
    const shield = catalogBonusEntriesForItem('Bojowa Tarcza', 9);
    expect(shield.length).toBeGreaterThan(0);
    expect(shield.every((entry) => entry.valueAtLevel !== null && entry.line.includes(' '))).toBe(
      true,
    );
    expect(shield.some((entry) => entry.name.toLocaleLowerCase('pl').includes('obron'))).toBe(true);

    const knife = catalogBonusEntriesForItem('Krótki Nóż', 9);
    expect(
      knife.every((entry) => !entry.name.toLocaleLowerCase('pl').includes('obrona')),
    ).toBe(true);
  });
  it('keeps catalog builtins non-editable and exposes slot mix pools', () => {
    const split = splitItemBonuses('Bojowa Tarcza', 9, [
      'Obrona +57',
      'Silny przeciwko Nieumarłym +20%',
      'Max PŻ +2000',
    ]);
    expect(split.builtin.some((line) => line.includes('Obrona'))).toBe(true);
    expect(split.additional).toEqual([
      'Silny przeciwko Nieumarłym +20%',
      'Max PŻ +2000',
    ]);
    const weaponPool = additionalBonusOptionsForSlot('weapon');
    expect(weaponPool).toContain('Silny przeciwko Nieumarłym +20%');
    expect(weaponPool).toContain('Siła +12');
    expect(additionalBonusOptionsForSlot('armor').length).toBeGreaterThan(0);
  });



  it('fills truncated wiki ladders via overrides for black steel armor and crystal bracelet', () => {
    expect(resolveItemBonuses('Zbroja Z Czarnej Stali', 9)).toEqual(
      expect.arrayContaining(['Odporność na Magię +20%']),
    );
    // At +9 PH presentation snapshot wins over wiki ladder for documented jewelry.
    expect(resolveItemBonuses('Kryształowa Bransoleta', 9)).toEqual(
      expect.arrayContaining(['Szybkość ataku +10%', 'Szansa na podwójne Yang 7%']),
    );
    // Below +9, wiki / dump ladder still applies (PH only documents +9).
    expect(resolveItemBonuses('Kryształowa Bransoleta', 8)).toEqual(
      expect.arrayContaining(['Szybk. Ataku +9%', 'Regeneracja PŻ +45%']),
    );
  });

  it('marks wiki lvl 30/75 weapons for average/skill as additional kinds within max 5', () => {
    expect(weaponRequiredLevel('Ostrze Z Czerwonej Stali')).toBe(30);
    expect(weaponRequiredLevel('Zatruty Miecz')).toBe(75);
    expect(weaponHasAverageSkillDamage('Ostrze Z Czerwonej Stali +9')).toBe(true);
    expect(weaponHasAverageSkillDamage('Krótki Nóż')).toBe(false);
    expect(weaponHasPhPvmAttackBonuses('Zatruty Miecz')).toBe(true);
    expect(maxAdditionalBonusesForItem('Zatruty Miecz', 'weapon')).toBe(5);
    expect(additionalBonusOptionsForSlot('weapon')).toContain('Silny przeciwko Mistykom +2%');
    expect(additionalBonusOptionsForSlot('weapon')).toContain('Silny przeciwko Mistykom +20%');
    expect(additionalBonusOptionsForItem('Zatruty Miecz', 'weapon')).toContain('Średnie Obrażenia +20%');
    expect(additionalBonusOptionsForItem('Zatruty Miecz', 'weapon')).toContain(
      'Obrażenia Umiejętności +10%',
    );
    expect(additionalBonusOptionsForItem('Krótki Nóż', 'weapon')).not.toContain(
      'Średnie Obrażenia +20%',
    );
  });

  it('fills Zatruty Miecz upgrade ladder from wiki overrides (AV + AS)', () => {
    expect(resolveItemBonuses('Zatruty Miecz', 9)).toEqual(
      expect.arrayContaining(['Wartość Ataku +237-277', 'Szybkość Ataku +26%']),
    );
    expect(resolveItemBonuses('Zatruty Miecz', 0)).toEqual(
      expect.arrayContaining(['Wartość Ataku +100-140', 'Szybkość Ataku +17%']),
    );
    const { builtin } = splitItemBonuses('Zatruty Miecz +9', 9, []);
    expect(builtin.length).toBeGreaterThan(0);
  });

  it('fills Miecz Żalu upgrade ladder from wiki overrides (AV + AS)', () => {
    expect(resolveItemBonuses('Miecz Żalu', 9)).toEqual(
      expect.arrayContaining(['Wartość Ataku +226-274', 'Szybkość Ataku +26%']),
    );
    expect(resolveItemBonuses('Miecz Żalu', 0)).toEqual(
      expect.arrayContaining(['Wartość Ataku +136-184', 'Szybkość Ataku +17%']),
    );
    const { builtin } = splitItemBonuses('Miecz Żalu +9', 9, []);
    expect(builtin.length).toBeGreaterThan(0);
  });

  it('uses PH plus9 snapshot as builtins for Ametystowe Kolczyki +9', () => {
    expect(phRequiredLevel('Ametystowe Kolczyki')).toBe(54);
    expect(phPlus9Lines('Ametystowe Kolczyki')).toEqual([
      'Siła +14',
      'Szansa na krytyczne uderzenie +5%',
      'Wartość ataku +30',
      'Max PŻ +1650',
    ]);
    expect(resolveItemBonuses('Ametystowe Kolczyki', 9)).toEqual([
      'Siła +14',
      'Szansa na krytyczne uderzenie +5%',
      'Wartość ataku +30',
      'Max PŻ +1650',
    ]);
    expect(resolveItemBonuses('Ametystowe Kolczyki +9', 9)).toContain('Siła +14');
    const entries = catalogBonusEntriesForItem('Ametystowe Kolczyki', 9);
    expect(entries.map((entry) => entry.line)).toEqual(phPlus9Lines('Ametystowe Kolczyki'));
    expect(splitItemBonuses('Ametystowe Kolczyki', 9, ['Siła +14', 'Max PŻ +2000']).builtin).toContain(
      'Siła +14',
    );
    expect(splitItemBonuses('Ametystowe Kolczyki', 9, ['Siła +14', 'Max PŻ +2000']).additional).toEqual([
      'Max PŻ +2000',
    ]);
  });

});
