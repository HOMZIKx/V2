import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { findGameItemByTitle, gameItemCatalog, resolveItemIconPath } from './item-catalog.js';

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));

describe('imported item image paths', () => {
  it('uses the downloaded V2 wiki asset when the manual image map has no entry', () => {
    const agat = findGameItemByTitle('Agat');

    expect(agat?.imagePath).toBe('/item-database/wiki/wiki_6d268d9a42a049a3.png');
    expect(agat?.sourceImageUrl).toBe('/game/items/wiki/wiki_6d268d9a42a049a3.png');
    expect(resolveItemIconPath('Agat')).toBe('/game/items/wiki/wiki_6d268d9a42a049a3.png');
  });

  it('has a real public file for every imported legacy wiki image', () => {
    const imported = gameItemCatalog.filter((item) => item.imagePath?.startsWith('/item-database/wiki/'));
    expect(imported.length).toBeGreaterThan(0);

    const missing = imported.filter((item) => {
      if (!item.sourceImageUrl?.startsWith('/game/items/')) return true;
      return !existsSync(path.join(publicRoot, item.sourceImageUrl.slice(1)));
    });

    expect(missing.map((item) => ({ id: item.id, title: item.title, image: item.sourceImageUrl }))).toEqual([]);
  });
});
