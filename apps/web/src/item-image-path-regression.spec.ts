import { describe, expect, it } from 'vitest';

import { findGameItemByTitle, resolveItemIconPath } from './item-catalog.js';

describe('imported item image paths', () => {
  it('uses the downloaded V2 wiki asset when the manual image map has no entry', () => {
    const agat = findGameItemByTitle('Agat');

    expect(agat?.imagePath).toBe('/item-database/wiki/wiki_6d268d9a42a049a3.png');
    expect(agat?.sourceImageUrl).toBe('/game/items/wiki/wiki_6d268d9a42a049a3.png');
    expect(resolveItemIconPath('Agat')).toBe('/game/items/wiki/wiki_6d268d9a42a049a3.png');
  });
});
