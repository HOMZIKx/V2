import { describe, expect, it, vi } from 'vitest';

import { getCatalogWikiImageResponse } from './item-image-proxy';

describe('item image proxy', () => {
  it('serves an already downloaded wiki icon locally without an external request', async () => {
    const fetchImpl = vi.fn(() => {
      throw new Error('external fetch must not run for a local asset');
    }) as unknown as typeof fetch;

    const response = await getCatalogWikiImageResponse('wiki_6d268d9a42a049a3.png', fetchImpl);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-item-image-source')).toBe('local');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('resolves a missing local icon from the official Metin2 MediaWiki API', async () => {
    const fetchImpl = vi.fn((input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
      const prop = url.searchParams.get('prop');

      if (url.pathname === '/api.php' && prop === 'images') {
        return Promise.resolve(
          Response.json({
            query: {
              pages: [
                {
                  title: 'Amulet Karmy 1',
                  images: [
                    { title: 'Plik:Czarne Tło.png' },
                    { title: 'Plik:Amulet Karmy 1.png' },
                  ],
                },
              ],
            },
          }),
        );
      }

      if (url.pathname === '/api.php' && prop === 'imageinfo') {
        return Promise.resolve(
          Response.json({
            query: {
              pages: [
                {
                  title: 'Plik:Amulet Karmy 1.png',
                  imageinfo: [
                    { url: 'https://pl-wiki.metin2.gameforge.com/images/9/90/Amulet_Karmy_1.png' },
                  ],
                },
              ],
            },
          }),
        );
      }

      if (url.pathname === '/images/9/90/Amulet_Karmy_1.png') {
        return Promise.resolve(
          new Response(new Uint8Array([137, 80, 78, 71]), {
            status: 200,
            headers: { 'content-type': 'image/png', 'content-length': '4' },
          }),
        );
      }

      throw new Error(`unexpected fetch: ${url.toString()}`);
    }) as unknown as typeof fetch;

    const response = await getCatalogWikiImageResponse('wiki_d69e989913be0bfd.png', fetchImpl);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-item-image-source')).toBe('metin2-wiki');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
