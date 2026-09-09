import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import catalogDocument from './data/dobry-temat-item-catalog.json';
import phItemIconMap from './data/ph-item-icon-map.json';
import wikiImageMap from './data/wiki-item-image-map.json';
import { findGameItemByTitle, gameItemCatalog, resolveItemIconPath } from './item-catalog.js';
import { catalogItemForWikiFilename } from './server/item-image-proxy.js';

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));

type LegacyCatalogItem = {
  readonly id: string;
  readonly title: string;
  readonly image_url?: string;
};

const legacyCatalog = catalogDocument.items as readonly LegacyCatalogItem[];
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

describe('imported item image paths', () => {
  it('uses the downloaded V2 wiki asset when available', () => {
    const agat = findGameItemByTitle('Agat');

    expect(agat?.imagePath).toBe('/item-database/wiki/wiki_6d268d9a42a049a3.png');
    expect(agat?.sourceImageUrl).toBe('/game/items/wiki/wiki_6d268d9a42a049a3.png');
    expect(resolveItemIconPath('Agat')).toBe('/game/items/wiki/wiki_6d268d9a42a049a3.png');
    expect(existsSync(path.join(publicRoot, 'game/items/wiki/wiki_6d268d9a42a049a3.png'))).toBe(true);
  });

  it('gives every imported wiki icon either a real public file or an official-wiki fallback', () => {
    const imported = gameItemCatalog.filter((item) => item.imagePath?.startsWith('/item-database/wiki/'));
    expect(imported.length).toBeGreaterThan(0);

    const unresolved = imported.filter((item) => {
      const sourceImageUrl = item.sourceImageUrl;
      if (!sourceImageUrl?.startsWith('/game/items/')) return true;

      const localExists = existsSync(path.join(publicRoot, sourceImageUrl.slice(1)));
      if (localExists) return false;

      if (!sourceImageUrl.startsWith('/game/items/wiki/')) return true;
      const filename = path.posix.basename(sourceImageUrl);
      const fallbackItem = catalogItemForWikiFilename(filename);
      return (
        fallbackItem?.id !== item.id ||
        !fallbackItem.wikiUrl?.startsWith('https://pl-wiki.metin2.gameforge.com/')
      );
    });

    expect(
      unresolved.map((item) => ({ id: item.id, title: item.title, image: item.sourceImageUrl })),
    ).toEqual([]);
  });

  it('keeps a known missing binary addressable by the fallback route', () => {
    const missing = findGameItemByTitle('Amulet Karmy 1');
    expect(missing?.sourceImageUrl).toBe('/game/items/wiki/wiki_d69e989913be0bfd.png');
    expect(existsSync(path.join(publicRoot, 'game/items/wiki/wiki_d69e989913be0bfd.png'))).toBe(false);
    expect(catalogItemForWikiFilename('wiki_d69e989913be0bfd.png')?.title).toBe('Amulet Karmy 1');
  });

  it('does not silently point an item id at another item wiki asset', () => {
    const suspicious = legacyCatalog.flatMap((item) => {
      const mapped = wikiImages[item.id];
      if (!mapped) return [];
      const mappedId = wikiAssetId(mapped);
      if (!mappedId || mappedId === item.id) return [];
      return [
        {
          id: item.id,
          title: item.title,
          mapped,
          mappedId,
          canonical: importedImagePath(item.image_url),
          phOverride: phIcons[item.title] ?? null,
        },
      ];
    });

    expect(suspicious).toEqual([]);
  });
});
