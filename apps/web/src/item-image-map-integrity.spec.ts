import path from 'node:path';
import { describe, expect, it } from 'vitest';

import catalogDocument from './data/dobry-temat-item-catalog.json';
import phItemIconMap from './data/ph-item-icon-map.json';
import wikiImageMap from './data/wiki-item-image-map.json';

type LegacyCatalogItem = {
  readonly id: string;
  readonly title: string;
  readonly image_url?: string;
};

const catalog = catalogDocument.items as readonly LegacyCatalogItem[];
const wikiImages = wikiImageMap as Readonly<Record<string, string>>;
const phIcons = phItemIconMap as Readonly<Record<string, string>>;

function importedImagePath(imageUrl: string | undefined): string | null {
  const value = imageUrl?.trim();
  if (!value) return null;
  const prefix = '/item-database/wiki/';
  if (value.startsWith(prefix)) return `/game/items/wiki/${value.slice(prefix.length)}`;
  if (value.startsWith('/game/items/')) return value;
  return null;
}

function wikiAssetId(imagePath: string): string | null {
  const filename = path.posix.basename(imagePath.trim());
  const match = /^(wiki_[a-f0-9]+)\.(?:png|jpe?g|webp)$/iu.exec(filename);
  return match?.[1] ?? null;
}

describe('wiki item image map integrity', () => {
  it('has a canonical imported image path for every database item', () => {
    const missing = catalog
      .filter((item) => importedImagePath(item.image_url) === null)
      .map((item) => ({ id: item.id, title: item.title, image: item.image_url ?? null }));

    expect(missing).toEqual([]);
  });

  it('does not silently point an item id at another item wiki asset', () => {
    const suspicious = catalog.flatMap((item) => {
      const mapped = wikiImages[item.id];
      if (!mapped) return [];
      const mappedId = wikiAssetId(mapped);
      if (!mappedId || mappedId === item.id) return [];
      const canonical = importedImagePath(item.image_url);
      return [
        {
          id: item.id,
          title: item.title,
          mapped,
          mappedId,
          canonical,
          phOverride: phIcons[item.title] ?? null,
        },
      ];
    });

    expect(suspicious).toEqual([]);
  });
});
