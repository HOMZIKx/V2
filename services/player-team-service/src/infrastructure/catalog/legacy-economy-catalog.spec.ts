import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadLegacyEconomyCatalog,
  parseLegacyEconomyCatalogCsv,
} from './legacy-economy-catalog.js';

describe('parseLegacyEconomyCatalogCsv', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps only catalog fields, trims names and deduplicates case-insensitively', () => {
    const csv = [
      'name,uplevel,description,category,image_url,rarity,id,created_date,updated_date,created_by_id,created_by,is_sample',
      '"Kryształ Dusz","","sekret","Inne","","Zwykły","abc","","","owner","private@example.com","false"',
      '"Kryształ Dusz ","","duplikat","Specjalne","https://example.com/ignored.png","Zwykły","def","","","owner","private@example.com","false"',
      '"Runiczny Pył","","","Broń","https://example.com/rune.png","Zwykły","ghi","","","owner","private@example.com","false"',
      '"Kupon GEM(5)","","","Inne","","Zwykły","jkl","","","owner","private@example.com","false"',
    ].join('\n');

    const items = parseLegacyEconomyCatalogCsv(csv);

    expect(items).toEqual([
      {
        id: 'legacy_abc',
        canonicalName: 'Kryształ Dusz',
        category: 'Pozostałe',
        imageUrl: null,
      },
      {
        id: 'legacy_ghi',
        canonicalName: 'Runiczny Pył',
        category: 'Ulepszacze',
        imageUrl: 'https://example.com/rune.png',
      },
      {
        id: 'legacy_jkl',
        canonicalName: 'Kupon GEM(5)',
        category: 'Pozostałe',
        imageUrl: null,
      },
    ]);
    expect(JSON.stringify(items)).not.toContain('private@example.com');
    expect(JSON.stringify(items)).not.toContain('sekret');
  });

  it('rejects an unexpected export schema', () => {
    expect(() => parseLegacyEconomyCatalogCsv('name,category\nTest,Inne')).toThrow(
      'unexpected header',
    );
  });

  it('does not block service startup when the legacy GitHub export is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network down'));

    await expect(loadLegacyEconomyCatalog()).resolves.toEqual([]);
  });
});
