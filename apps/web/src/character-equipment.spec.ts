import { describe, expect, it } from 'vitest';

import {
  assignPlannedItem,
  characterEquipmentFixture,
  confirmItemLocation,
  filterCatalogItems,
  getEquipmentCompletion,
  removePlannedItem,
  restartProgressTimer,
} from './character-equipment.js';

describe('character equipment view model', () => {
  const warSet = characterEquipmentFixture.sets[0]!;

  it('moves only a compatible item into a planned slot', () => {
    const knife = characterEquipmentFixture.catalog.find((item) => item.id === 'short-knife')!;
    const moved = assignPlannedItem(warSet.assignments, knife, 'weapon');

    expect(moved.weapon).toBe('short-knife');
    expect(warSet.assignments.weapon).toBe('zodiac-sword');
    expect(assignPlannedItem(warSet.assignments, knife, 'shield')).toBe(warSet.assignments);
  });

  it('removes an item from a planned set without changing confirmed location metadata', () => {
    const next = removePlannedItem(warSet.assignments, 'shield');
    const shield = characterEquipmentFixture.catalog.find((item) => item.id === 'battle-shield')!;

    expect(next.shield).toBeNull();
    expect(shield.lastConfirmedCharacterName).toBe('Aalpsik');
  });

  it('counts assignments and filters by category or bonus', () => {
    expect(getEquipmentCompletion(warSet.assignments)).toBe(7);
    expect(filterCatalogItems(characterEquipmentFixture.catalog, '', 'weapon')).toHaveLength(2);
    expect(filterCatalogItems(characterEquipmentFixture.catalog, 'max pż', 'all')).toHaveLength(3);
  });

  it('keeps planning separate from an explicit physical-location confirmation', () => {
    const confirmed = confirmItemLocation(
      characterEquipmentFixture.catalog,
      'battle-shield',
      'NerwNicht',
      'Mateusz',
    );

    expect(confirmed.find((item) => item.id === 'battle-shield')).toMatchObject({
      lastConfirmedCharacterName: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedLabel: 'teraz',
    });
    expect(
      characterEquipmentFixture.catalog.find((item) => item.id === 'battle-shield')
        ?.lastConfirmedCharacterName,
    ).toBe('Aalpsik');
  });

  it('restarts only a timer explicitly confirmed by the player', () => {
    const restarted = restartProgressTimer(characterEquipmentFixture.timers, 'horse-medal');

    expect(restarted[1]).toMatchObject({
      status: 'running',
      progressPercent: 0,
      readyLabel: 'odliczanie rozpoczęte',
    });
    expect(restarted[0]).toBe(characterEquipmentFixture.timers[0]);
  });
});
