import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { gameItemCatalog, type GameItem } from '../item-catalog';

const WIKI_HOST = 'pl-wiki.metin2.gameforge.com';
const WIKI_ORIGIN = `https://${WIKI_HOST}`;
const MAX_REMOTE_IMAGE_BYTES = 2 * 1024 * 1024;
const REMOTE_TIMEOUT_MS = 8_000;

const IMAGE_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
} as const;

const IGNORED_IMAGE_WORDS = [
  'czarne tlo',
  'zielony haczyk',
  'home',
  'powered by mediawiki',
  'no',
  'yes',
];

type FetchLike = typeof fetch;

type WikiImageEntry = {
  readonly title?: unknown;
};

type WikiImageInfo = {
  readonly url?: unknown;
};

type WikiPage = {
  readonly title?: unknown;
  readonly images?: unknown;
  readonly imageinfo?: unknown;
};

type WikiQueryPayload = {
  readonly query?: {
    readonly pages?: unknown;
  };
};

function normalizeImageName(value: string): string {
  return value
    .replace(/^(?:Plik|File):/iu, '')
    .replace(/\.(?:png|jpe?g|webp|gif)$/iu, '')
    .replace(/[_+]+/gu, ' ')
    .toLocaleLowerCase('pl')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function sortedTokens(value: string): string {
  return normalizeImageName(value)
    .split(' ')
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'pl'))
    .join(' ');
}

function imageCandidateScore(fileTitle: string, itemTitle: string): number {
  const file = normalizeImageName(fileTitle);
  const item = normalizeImageName(itemTitle);
  if (!file || !item) return -1;
  if (IGNORED_IMAGE_WORDS.some((word) => file.includes(word))) return -1;
  if (file === item) return 1_000;
  if (sortedTokens(file) === sortedTokens(item)) return 900;
  if (file.startsWith(item) || item.startsWith(file)) return 700;
  if (file.includes(item) || item.includes(file)) return 600;

  const itemTokens = new Set(item.split(' ').filter((token) => token.length >= 3));
  const fileTokens = new Set(file.split(' ').filter((token) => token.length >= 3));
  if (itemTokens.size === 0 || fileTokens.size === 0) return -1;
  const shared = [...itemTokens].filter((token) => fileTokens.has(token)).length;
  const overlap = shared / Math.max(itemTokens.size, fileTokens.size);
  return overlap >= 0.66 ? Math.round(overlap * 500) : -1;
}

function asWikiPages(value: unknown): readonly WikiPage[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is WikiPage => Boolean(entry && typeof entry === 'object'));
}

function legacyWikiFilename(item: GameItem): string | null {
  const imagePath = item.imagePath?.trim();
  if (!imagePath?.startsWith('/item-database/wiki/')) return null;
  const filename = path.posix.basename(imagePath);
  return filename && filename !== '.' ? filename : null;
}

export function catalogItemForWikiFilename(filename: string): GameItem | null {
  const clean = path.posix.basename(filename.trim());
  if (!clean || clean !== filename.trim()) return null;
  return gameItemCatalog.find((item) => legacyWikiFilename(item) === clean) ?? null;
}

function wikiPageTitle(item: GameItem): string | null {
  if (!item.wikiUrl) return null;
  try {
    const url = new URL(item.wikiUrl);
    if (url.protocol !== 'https:' || url.hostname !== WIKI_HOST) return null;
    const marker = '/index.php/';
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex >= 0) {
      return decodeURIComponent(url.pathname.slice(markerIndex + marker.length)).replace(/_/gu, ' ');
    }
    const fromQuery = url.searchParams.get('title');
    return fromQuery ? fromQuery.replace(/_/gu, ' ') : null;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(fetchImpl: FetchLike, input: string): Promise<Response> {
  return fetchImpl(input, {
    redirect: 'follow',
    headers: {
      Accept: 'application/json, image/avif, image/webp, image/png, image/jpeg, */*;q=0.8',
      'User-Agent': 'DESTILED-V2/1.0 (+item-image-proxy)',
    },
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
  });
}

async function fetchWikiJson(fetchImpl: FetchLike, url: URL): Promise<WikiQueryPayload | null> {
  try {
    const response = await fetchWithTimeout(fetchImpl, url.toString());
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as WikiQueryPayload | null;
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

async function resolveWikiImageUrl(item: GameItem, fetchImpl: FetchLike): Promise<string | null> {
  const pageTitle = wikiPageTitle(item);
  if (!pageTitle) return null;

  const imagesUrl = new URL('/api.php', WIKI_ORIGIN);
  imagesUrl.searchParams.set('action', 'query');
  imagesUrl.searchParams.set('format', 'json');
  imagesUrl.searchParams.set('formatversion', '2');
  imagesUrl.searchParams.set('prop', 'images');
  imagesUrl.searchParams.set('imlimit', 'max');
  imagesUrl.searchParams.set('titles', pageTitle);

  const imagesPayload = await fetchWikiJson(fetchImpl, imagesUrl);
  const pages = asWikiPages(imagesPayload?.query?.pages);
  const imageEntries = pages.flatMap((page) =>
    Array.isArray(page.images)
      ? page.images.filter((entry): entry is WikiImageEntry => Boolean(entry && typeof entry === 'object'))
      : [],
  );
  const candidates = imageEntries
    .map((entry) => (typeof entry.title === 'string' ? entry.title : null))
    .filter((title): title is string => Boolean(title))
    .map((title) => ({ title, score: imageCandidateScore(title, item.title) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

  if (candidates.length === 0) return null;

  const infoUrl = new URL('/api.php', WIKI_ORIGIN);
  infoUrl.searchParams.set('action', 'query');
  infoUrl.searchParams.set('format', 'json');
  infoUrl.searchParams.set('formatversion', '2');
  infoUrl.searchParams.set('prop', 'imageinfo');
  infoUrl.searchParams.set('iiprop', 'url');
  infoUrl.searchParams.set('titles', candidates.map((entry) => entry.title).join('|'));

  const infoPayload = await fetchWikiJson(fetchImpl, infoUrl);
  const infoPages = asWikiPages(infoPayload?.query?.pages);
  const byTitle = new Map(candidates.map((entry) => [entry.title, entry.score] as const));
  const resolved = infoPages
    .flatMap((page) => {
      const title = typeof page.title === 'string' ? page.title : '';
      const infos = Array.isArray(page.imageinfo)
        ? page.imageinfo.filter((entry): entry is WikiImageInfo => Boolean(entry && typeof entry === 'object'))
        : [];
      const url = infos.find((entry) => typeof entry.url === 'string')?.url;
      return typeof url === 'string' ? [{ title, url, score: byTitle.get(title) ?? -1 }] : [];
    })
    .sort((left, right) => right.score - left.score);

  for (const candidate of resolved) {
    try {
      const url = new URL(candidate.url);
      if (url.protocol === 'https:' && url.hostname === WIKI_HOST) return url.toString();
    } catch {
      // Ignore malformed wiki image URLs.
    }
  }
  return null;
}

function itemTitleRedirectCandidates(item: GameItem): readonly string[] {
  const legacyExt = legacyWikiFilename(item)?.split('.').pop()?.toLocaleLowerCase('en') ?? 'png';
  const extensions = [...new Set([legacyExt, 'png', 'jpg', 'jpeg'])].filter((ext) =>
    /^(?:png|jpe?g)$/u.test(ext),
  );
  const filenameBase = item.title.replace(/\s+/gu, '_');
  return extensions.map(
    (ext) => `${WIKI_ORIGIN}/index.php/Special:Redirect/file/${encodeURIComponent(`${filenameBase}.${ext}`)}`,
  );
}

async function fetchRemoteImage(fetchImpl: FetchLike, url: string): Promise<Response | null> {
  try {
    const response = await fetchWithTimeout(fetchImpl, url);
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!contentType.startsWith('image/')) return null;
    const declaredSize = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredSize) && declaredSize > MAX_REMOTE_IMAGE_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_REMOTE_IMAGE_BYTES) return null;
    return new Response(bytes, {
      status: 200,
      headers: {
        ...IMAGE_CACHE_HEADERS,
        'Content-Type': contentType,
        'X-Item-Image-Source': 'metin2-wiki',
      },
    });
  } catch {
    return null;
  }
}

async function readLocalWikiImage(filename: string): Promise<Response | null> {
  const filePath = path.join(process.cwd(), 'public', 'game', 'items', 'wiki', filename);
  try {
    const bytes = await readFile(filePath);
    const extension = path.extname(filename).toLocaleLowerCase('en');
    const contentType = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png';
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        ...IMAGE_CACHE_HEADERS,
        'Content-Type': contentType,
        'X-Item-Image-Source': 'local',
      },
    });
  } catch {
    return null;
  }
}

export async function getCatalogWikiImageResponse(
  filename: string,
  fetchImpl: FetchLike = fetch,
): Promise<Response> {
  const item = catalogItemForWikiFilename(filename);
  if (!item) return new Response(null, { status: 404 });

  const local = await readLocalWikiImage(filename);
  if (local) return local;

  const resolvedUrl = await resolveWikiImageUrl(item, fetchImpl);
  if (resolvedUrl) {
    const image = await fetchRemoteImage(fetchImpl, resolvedUrl);
    if (image) return image;
  }

  for (const candidate of itemTitleRedirectCandidates(item)) {
    const image = await fetchRemoteImage(fetchImpl, candidate);
    if (image) return image;
  }

  return new Response(null, {
    status: 404,
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'X-Item-Image-Source': 'missing',
    },
  });
}
