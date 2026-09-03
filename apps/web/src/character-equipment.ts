import type { CatalogLayer } from './member-dashboard';

export type EquipmentSlot =
  'weapon' | 'armor' | 'helmet' | 'shield' | 'earrings' | 'necklace' | 'bracelet' | 'shoes';

export interface CatalogItem {
  readonly id: string;
  readonly name: string;
  readonly iconPath: string;
  readonly category: EquipmentSlot;
  readonly levelLabel: string;
  readonly bonuses: readonly string[];
  readonly catalogLayer: CatalogLayer;
  readonly lastConfirmedCharacterName: string | null;
  readonly lastConfirmedBy: string | null;
  readonly lastConfirmedLabel: string | null;
}

export type EquipmentAssignments = Readonly<Record<EquipmentSlot, string | null>>;

export interface NamedEquipmentSet {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly assignments: EquipmentAssignments;
}

export interface CharacterProgressTimer {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly readyLabel: string;
  readonly status: 'ready' | 'running' | 'paused';
  readonly progressPercent: number;
  readonly discordReminder: boolean;
}

export interface CharacterEquipmentSnapshot {
  readonly viewerName: string;
  readonly teamName: string;
  readonly characterId: string;
  readonly characterName: string;
  readonly classLabel: string;
  readonly level: number;
  readonly imagePath: string;
  readonly responsibleMember: string;
  readonly sets: readonly NamedEquipmentSet[];
  readonly catalog: readonly CatalogItem[];
  readonly timers: readonly CharacterProgressTimer[];
}

export const equipmentSlots: readonly EquipmentSlot[] = [
  'weapon',
  'armor',
  'helmet',
  'shield',
  'earrings',
  'necklace',
  'bracelet',
  'shoes',
];

export const slotLabels: Readonly<Record<EquipmentSlot, string>> = {
  weapon: 'Broń',
  armor: 'Zbroja',
  helmet: 'Hełm',
  shield: 'Tarcza',
  earrings: 'Kolczyki',
  necklace: 'Naszyjnik',
  bracelet: 'Bransoleta',
  shoes: 'Buty',
};

const emptyAssignments: EquipmentAssignments = {
  weapon: null,
  armor: null,
  helmet: null,
  shield: null,
  earrings: null,
  necklace: null,
  bracelet: null,
  shoes: null,
};

export const characterEquipmentFixture: CharacterEquipmentSnapshot = {
  viewerName: 'Mateusz',
  teamName: 'Asteria',
  characterId: 'nerwnicht',
  characterName: 'NerwNicht',
  classLabel: 'Sura',
  level: 75,
  imagePath: '/game/classes/sura-male.png',
  responsibleMember: 'Mateusz',
  sets: [
    {
      id: 'war',
      name: 'Wojna',
      description: 'Układ pod walkę z graczami',
      assignments: {
        weapon: 'zodiac-sword',
        armor: 'ivory-suit',
        helmet: null,
        shield: 'battle-shield',
        earrings: 'ebony-earrings',
        necklace: 'jade-necklace',
        bracelet: 'wooden-bracelet',
        shoes: 'leather-boots',
      },
    },
    {
      id: 'dungeon',
      name: 'Dungeon',
      description: 'Roboczy układ pod PvM',
      assignments: {
        ...emptyAssignments,
        weapon: 'short-knife',
        armor: 'ivory-suit',
        necklace: 'wooden-necklace',
        shoes: 'leather-boots',
      },
    },
    {
      id: 'empty',
      name: 'Nowy set',
      description: 'Pusty szablon do skopiowania',
      assignments: emptyAssignments,
    },
  ],
  catalog: [
    {
      id: 'zodiac-sword',
      name: 'Zatruty Miecz +9',
      iconPath: '/game/items/wiki/wiki_99029de35c7b8aaf.jpg',
      category: 'weapon',
      levelLabel: 'od poziomu 75',
      bonuses: ['Średnie obrażenia +37%', 'Silny przeciwko ludziom +10%', 'Witalność +12'],
      catalogLayer: 'team_private',
      lastConfirmedCharacterName: 'NerwNicht',
      lastConfirmedBy: 'XiaoHu',
      lastConfirmedLabel: 'dzisiaj 22:41',
    },
    {
      id: 'short-knife',
      name: 'Krótki Nóż +9',
      iconPath: '/game/items/wiki/wiki_d4f9e07aa1bf2e10.jpg',
      category: 'weapon',
      levelLabel: 'od poziomu 1',
      bonuses: ['Szybkość ataku +15%', 'Wartość ataku +18'],
      catalogLayer: 'project_hard_source',
      lastConfirmedCharacterName: 'Aalpsik',
      lastConfirmedBy: 'Aalpsik',
      lastConfirmedLabel: 'wczoraj 19:20',
    },
    {
      id: 'ivory-suit',
      name: 'Mglista Zbroja Płytowa +1',
      iconPath: '/game/items/wiki/wiki_cd6e7c8dc615dca9.png',
      category: 'armor',
      levelLabel: 'od poziomu 48',
      bonuses: ['Max PŻ +800', 'Odporność na magię 10%', 'Wartość ataku +50'],
      catalogLayer: 'team_private',
      lastConfirmedCharacterName: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedLabel: 'dzisiaj 18:05',
    },
    {
      id: 'battle-shield',
      name: 'Bojowa Tarcza +9',
      iconPath: '/game/items/wiki/wiki_a2205fd93e6b34d6.png',
      category: 'shield',
      levelLabel: 'od poziomu 21',
      bonuses: ['Odporność na omdlenie', 'Szansa na blok ciosu +10%'],
      catalogLayer: 'destiled_curated',
      lastConfirmedCharacterName: 'Aalpsik',
      lastConfirmedBy: 'Wicek',
      lastConfirmedLabel: '2 dni temu',
    },
    {
      id: 'ebony-earrings',
      name: 'Ebonitowe Kolczyki +9',
      iconPath: '/game/items/wiki/wiki_9ed3702c5f233ff1.png',
      category: 'earrings',
      levelLabel: 'od poziomu 33',
      bonuses: ['Siła +12', 'Max PŻ +1650'],
      catalogLayer: 'project_hard_source',
      lastConfirmedCharacterName: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedLabel: 'dzisiaj 18:06',
    },
    {
      id: 'jade-necklace',
      name: 'Jadeitowy Naszyjnik +9',
      iconPath: '/game/items/wiki/wiki_3ebff6bb7c279bef.png',
      category: 'necklace',
      levelLabel: 'od poziomu 42',
      bonuses: ['Szybkość zaklęcia +22%', 'Zręczność +4'],
      catalogLayer: 'project_hard_source',
      lastConfirmedCharacterName: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedLabel: 'dzisiaj 18:07',
    },
    {
      id: 'wooden-necklace',
      name: 'Drewniany Naszyjnik +9',
      iconPath: '/game/items/wiki/wiki_f007ef1f5335f35e.png',
      category: 'necklace',
      levelLabel: 'od poziomu 1',
      bonuses: ['Szybkość zaklęcia +10%'],
      catalogLayer: 'project_hard_source',
      lastConfirmedCharacterName: null,
      lastConfirmedBy: null,
      lastConfirmedLabel: null,
    },
    {
      id: 'wooden-bracelet',
      name: 'Drewniana Bransoleta +9',
      iconPath: '/game/items/wiki/wiki_74d0f69b4b506d81.png',
      category: 'bracelet',
      levelLabel: 'od poziomu 0',
      bonuses: ['Szybkość ataku +5%', 'Czas trwania umiejętności +20 s'],
      catalogLayer: 'project_hard_source',
      lastConfirmedCharacterName: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedLabel: 'dzisiaj 18:08',
    },
    {
      id: 'leather-boots',
      name: 'Skórzane Kozaki +9',
      iconPath: '/game/items/wiki/wiki_8442ee8613037c74.png',
      category: 'shoes',
      levelLabel: 'od poziomu 29',
      bonuses: ['Szybkość ruchu +20%', 'Odporność na strzały +20%', 'Max PŻ +800'],
      catalogLayer: 'team_private',
      lastConfirmedCharacterName: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedLabel: 'dzisiaj 18:09',
    },
  ],
  timers: [
    {
      id: 'skill-book',
      label: 'Księga umiejętności',
      detail: 'Smoczy Wir M8 → M9 · reset o północy',
      readyLabel: 'za 24 min',
      status: 'running',
      progressPercent: 82,
      discordReminder: true,
    },
    {
      id: 'horse-medal',
      label: 'Jazda konna',
      detail: 'Jazda 12 → 13 · Medal Konny ×5 · cooldown 23 h',
      readyLabel: 'gotowe teraz',
      status: 'ready',
      progressPercent: 100,
      discordReminder: true,
    },
    {
      id: 'biologist',
      label: 'Biolog',
      detail: 'Pamiątka Po Demonie · 6/15',
      readyLabel: 'jutro 08:10',
      status: 'running',
      progressPercent: 41,
      discordReminder: false,
    },
  ],
};

/**
 * Tymczasowy adapter danych widoku. Docelowo rekord pochodzi z API zespołu;
 * już teraz każda udostępniona postać ma własną, pełną kartę, zamiast martwego linku.
 */
export function getCharacterEquipmentFixture(characterId: string): CharacterEquipmentSnapshot | null {
  const variants: Readonly<Record<string, Pick<CharacterEquipmentSnapshot, 'characterName' | 'classLabel' | 'level' | 'imagePath' | 'responsibleMember' | 'timers'>>> = {
    nerwnicht: {
      characterName: 'NerwNicht', classLabel: 'Sura', level: 75, imagePath: '/game/classes/sura-male.png', responsibleMember: 'Mateusz', timers: characterEquipmentFixture.timers,
    },
    aalpsik: {
      characterName: 'Aalpsik', classLabel: 'Ninja', level: 55, imagePath: '/game/classes/ninja-female.png', responsibleMember: 'Aalpsik',
      timers: [{ id: 'horse-medal', label: 'Jazda konna', detail: 'Jazda 12 → 13 · Medal Konny ×5 · cooldown 23 h', readyLabel: 'gotowe teraz', status: 'ready', progressPercent: 100, discordReminder: true }, { id: 'skill-book', label: 'Księga umiejętności', detail: 'Ostrze Duszy', readyLabel: 'za 42 min', status: 'running', progressPercent: 58, discordReminder: true }],
    },
    kimmizic: {
      characterName: 'Kimmizic', classLabel: 'Szaman', level: 61, imagePath: '/game/classes/shaman-male.png', responsibleMember: 'Wicek',
      timers: [{ id: 'biologist', label: 'Biolog', detail: 'Pamiątka Po Demonie · 6/15', readyLabel: 'jutro 08:10', status: 'running', progressPercent: 41, discordReminder: true }, { id: 'skill-book', label: 'Księga umiejętności', detail: 'Błogosławieństwo', readyLabel: 'za 1 h 18 min', status: 'running', progressPercent: 20, discordReminder: false }],
    },
  };
  const variant = variants[characterId];
  return variant ? { ...characterEquipmentFixture, characterId, ...variant } : null;
}

export function assignPlannedItem(
  assignments: EquipmentAssignments,
  item: CatalogItem,
  targetSlot: EquipmentSlot,
): EquipmentAssignments {
  if (item.category !== targetSlot) return assignments;

  const next = { ...assignments };
  for (const slot of equipmentSlots) {
    if (next[slot] === item.id) next[slot] = null;
  }
  next[targetSlot] = item.id;
  return next;
}

export function removePlannedItem(
  assignments: EquipmentAssignments,
  slot: EquipmentSlot,
): EquipmentAssignments {
  return { ...assignments, [slot]: null };
}

export function getEquipmentCompletion(assignments: EquipmentAssignments): number {
  return equipmentSlots.filter((slot) => assignments[slot] !== null).length;
}

export function filterCatalogItems(
  catalog: readonly CatalogItem[],
  query: string,
  category: EquipmentSlot | 'all',
): readonly CatalogItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('pl');
  return catalog.filter((item) => {
    const categoryMatches = category === 'all' || item.category === category;
    const queryMatches =
      normalizedQuery.length === 0 ||
      item.name.toLocaleLowerCase('pl').includes(normalizedQuery) ||
      item.bonuses.some((bonus) => bonus.toLocaleLowerCase('pl').includes(normalizedQuery));
    return categoryMatches && queryMatches;
  });
}

export function confirmItemLocation(
  catalog: readonly CatalogItem[],
  itemId: string,
  characterName: string,
  actorName: string,
): readonly CatalogItem[] {
  return catalog.map((item) =>
    item.id === itemId
      ? {
          ...item,
          lastConfirmedCharacterName: characterName,
          lastConfirmedBy: actorName,
          lastConfirmedLabel: 'teraz',
        }
      : item,
  );
}

export function restartProgressTimer(
  timers: readonly CharacterProgressTimer[],
  timerId: string,
): readonly CharacterProgressTimer[] {
  return timers.map((timer) =>
    timer.id === timerId
      ? { ...timer, status: 'running', progressPercent: 0, readyLabel: 'odliczanie rozpoczęte' }
      : timer,
  );
}
