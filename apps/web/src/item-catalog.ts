import catalogDocument from './data/dobry-temat-item-catalog.json';
import wikiImageMap from './data/wiki-item-image-map.json';

export interface GameItem {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly imagePath: string | null;
  readonly sourceImageUrl: string | null;
  readonly wikiUrl: string | null;
  readonly upgradeDescription: string | null;
}

interface LegacyCatalogItem {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly image_url?: string;
  readonly wiki_url?: string;
  readonly wiki_upgrade?: string;
}

const legacy = catalogDocument.items as readonly LegacyCatalogItem[];
const localImages = wikiImageMap as Record<string, string>;

export const gameItemCatalog: readonly GameItem[] = legacy.map((item) => {
  const local = localImages[item.id] ?? null;
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    imagePath: item.image_url ?? null,
    sourceImageUrl: local,
    wikiUrl: item.wiki_url ?? null,
    upgradeDescription: item.wiki_upgrade ?? null,
  };
});

export const gameItemCategories = [
  ...new Set(gameItemCatalog.map((item) => item.category)),
].sort((a, b) => a.localeCompare(b, 'pl'));

export function searchGameItems(query: string, category = 'all'): readonly GameItem[] {
  const normalized = query.trim().toLocaleLowerCase('pl');
  return gameItemCatalog.filter(
    (item) =>
      (category === 'all' || item.category === category) &&
      (normalized.length === 0 ||
        [item.title, item.category, item.upgradeDescription ?? ''].some((value) =>
          value.toLocaleLowerCase('pl').includes(normalized),
        )),
  );
}

export function findGameItemByTitle(title: string): GameItem | null {
  const normalized = title.trim().toLocaleLowerCase('pl');
  return (
    gameItemCatalog.find((item) => item.title.toLocaleLowerCase('pl') === normalized) ?? null
  );
}

/** Resolve catalog definition from a team card name like "Zatruty Miecz +9". */
export function findGameItemByCardName(cardName: string): GameItem | null {
  const trimmed = cardName.trim();
  const exact = findGameItemByTitle(trimmed);
  if (exact) return exact;
  const withoutEnhancement = trimmed.replace(/\s*\+\d+\s*$/u, '').trim();
  if (withoutEnhancement.length > 0 && withoutEnhancement !== trimmed) {
    return findGameItemByTitle(withoutEnhancement);
  }
  return null;
}

export function resolveItemIconPath(cardName: string, fallback = '/game/items/short-knife.svg'): string {
  return findGameItemByCardName(cardName)?.sourceImageUrl ?? fallback;
}

/** Map dobry-temat / wiki categories onto EQ board slots. */
export function equipmentSlotForCategory(
  category: string,
): 'weapon' | 'armor' | 'helmet' | 'shield' | 'earrings' | 'necklace' | 'bracelet' | 'shoes' | null {
  const value = category.toLocaleLowerCase('pl');
  if (value.includes('tarcze')) return 'shield';
  if (value.includes('buty')) return 'shoes';
  if (value.includes('kolczy')) return 'earrings';
  if (value.includes('naszyjn')) return 'necklace';
  if (value.includes('bransol')) return 'bracelet';
  if (value.includes('hełm') || value.includes('helm') || value.includes('czapka') || value.includes('maska') || value.includes('kaptur') || value.includes('kapelusz')) {
    return 'helmet';
  }
  if (value.includes('zbroj') || value.includes('szata')) return 'armor';
  if (
    value.includes('broń') ||
    value.includes('bron') ||
    value.includes('miecz') ||
    value.includes('sztylet') ||
    value.includes('łuk') ||
    value.includes('luk') ||
    value.includes('dzwon') ||
    value.includes('wachlar') ||
    value.includes('ostrz') ||
    value.includes('glew') ||
    value.includes('halab')
  ) {
    return 'weapon';
  }
  return null;
}

export function equipmentCatalogItems(): readonly GameItem[] {
  return gameItemCatalog.filter((item) => equipmentSlotForCategory(item.category) !== null);
}
