import catalogDocument from './data/dobry-temat-item-catalog.json';

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
export const gameItemCatalog: readonly GameItem[] = legacy.map((item) => ({
  id: item.id,
  title: item.title,
  category: item.category,
  imagePath: item.image_url ?? null,
  // Grafiki ze starego, prywatnego repo nie mogą być pobierane przez przeglądarkę
  // produkcyjnej aplikacji. Zachowujemy ścieżkę jako dane migracyjne, a obrazki
  // włączymy dopiero po skopiowaniu ich do publicznych assetów DESTILED.
  sourceImageUrl: null,
  wikiUrl: item.wiki_url ?? null,
  upgradeDescription: item.wiki_upgrade ?? null,
}));

export const gameItemCategories = [...new Set(gameItemCatalog.map((item) => item.category))].sort((a, b) => a.localeCompare(b, 'pl'));

export function searchGameItems(query: string, category = 'all'): readonly GameItem[] {
  const normalized = query.trim().toLocaleLowerCase('pl');
  return gameItemCatalog.filter((item) =>
    (category === 'all' || item.category === category) &&
    (normalized.length === 0 || [item.title, item.category, item.upgradeDescription ?? ''].some((value) => value.toLocaleLowerCase('pl').includes(normalized))),
  );
}
