import { NextRequest, NextResponse } from 'next/server';

import { gameItemCatalog } from '../../../../src/item-catalog';
import { verifiedViewerId } from '../../../../src/server/verified-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RawRecognizedItem = {
  slotIndex?: unknown;
  row?: unknown;
  column?: unknown;
  name?: unknown;
  quantity?: unknown;
  itemConfidence?: unknown;
  quantityConfidence?: unknown;
  confidence?: unknown;
  alternatives?: unknown;
};
type RateBucket = { count: number; resetAt: number };
type DynamicCatalogItem = {
  id: string;
  canonicalName: string;
  category: string;
  imageUrl: string | null;
};
type CatalogMatch = {
  id: string;
  name: string;
  category: string;
  imageUrl: string | null;
};
type RecognizedItem = {
  slotIndex: number;
  row: number;
  column: number;
  recognizedName: string;
  quantity: number;
  itemConfidence: number;
  quantityConfidence: number;
  confidence: number;
  alternatives: string[];
  catalogMatch: CatalogMatch | null;
};

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 20;
const DYNAMIC_LOOKUP_LIMIT = 40;
const GRID_COLUMNS = 4;
const MAX_RECOGNIZED_ITEMS = 200;
const MAX_CATALOG_NAMES_IN_PROMPT = 1200;
const rateBuckets = new Map<string, RateBucket>();

const canonicalCatalogNames = Array.from(
  new Set(gameItemCatalog.map((item) => item.title.trim()).filter(Boolean)),
).slice(0, MAX_CATALOG_NAMES_IN_PROMPT);

function rateLimited(viewerId: string): boolean {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
  const existing = rateBuckets.get(viewerId);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(viewerId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (existing.count >= RATE_LIMIT) return true;
  existing.count += 1;
  return false;
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
}

function confidence(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function positiveInteger(value: unknown, fallback = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function integer(value: unknown, fallback = -1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
}

function alternatives(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim())
    .slice(0, 3);
}

function bestStaticCatalogMatch(name: string): CatalogMatch | null {
  const target = normalize(name);
  if (!target) return null;
  const exact = gameItemCatalog.find((item) => normalize(item.title) === target);
  const candidates = exact
    ? [exact]
    : gameItemCatalog.filter((item) => {
        const title = normalize(item.title);
        return title.includes(target) || target.includes(title);
      });
  const catalog = candidates.length === 1 ? candidates[0] : null;
  return catalog
    ? {
        id: catalog.id,
        name: catalog.title,
        category: catalog.category,
        imageUrl: catalog.sourceImageUrl ?? catalog.imagePath,
      }
    : null;
}

function workspaceIdFromRequest(request: NextRequest): string | null {
  const referer = request.headers.get('referer');
  if (!referer) return null;
  try {
    const path = new URL(referer).pathname;
    const match = /^\/teams\/([^/]+)\/economy(?:\/|$)/.exec(path);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function chooseDynamicMatch(name: string, rows: readonly DynamicCatalogItem[]): CatalogMatch | null {
  const target = normalize(name);
  if (!target) return null;
  const exact = rows.find((item) => normalize(item.canonicalName) === target);
  if (exact) {
    return {
      id: exact.id,
      name: exact.canonicalName,
      category: exact.category,
      imageUrl: exact.imageUrl,
    };
  }
  const candidates = rows.filter((item) => {
    const candidate = normalize(item.canonicalName);
    return candidate.includes(target) || target.includes(candidate);
  });
  const match = candidates.length === 1 ? candidates[0] : null;
  return match
    ? { id: match.id, name: match.canonicalName, category: match.category, imageUrl: match.imageUrl }
    : null;
}

async function dynamicCatalogMatch(
  request: NextRequest,
  workspaceId: string,
  name: string,
): Promise<CatalogMatch | null> {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  try {
    const url = new URL(
      `/player-team/v1/economy/workspaces/${encodeURIComponent(workspaceId)}/items?q=${encodeURIComponent(name)}`,
      request.nextUrl.origin,
    );
    const response = await fetch(url, {
      headers: { accept: 'application/json', cookie },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as DynamicCatalogItem[];
    return chooseDynamicMatch(name, Array.isArray(rows) ? rows : []);
  } catch (error) {
    console.error('team economy dynamic catalogue lookup failed', error);
    return null;
  }
}

function recognitionPrompt(): string {
  const names = canonicalCatalogNames.map((name) => `- ${name}`).join('\n');
  return `Jesteś modułem odczytu ekwipunku Metin2. Ten obraz przedstawia siatkę ekwipunku/dropu z 4 kolumnami.

ZADANIE:
1. Analizuj KAŻDY SLOT OSOBNO, od lewej do prawej i od góry do dołu.
2. Pomijaj puste sloty. Nie twórz przedmiotu dla pustego pola.
3. slotIndex jest liczony od 0: row * 4 + column. row i column także liczymy od 0.
4. Nazwę rozpoznawaj przede wszystkim po ikonie. Jeżeli pasuje do katalogu poniżej, zwróć DOKŁADNIE nazwę z katalogu. Nie wymyślaj podobnej nazwy.
5. Ilość odczytuj WYŁĄCZNIE z białej liczby nałożonej w prawym dolnym rogu konkretnego slotu. To może być liczba jedno-, dwu- lub trzycyfrowa. Jeżeli liczby naprawdę nie ma, quantity=1. Nie wyprowadzaj ilości z wyglądu ikony ani z sąsiedniego slotu.
6. Oceniaj osobno pewność nazwy i pewność ilości. Gdy cyfry są małe/nieostre, obniż quantityConfidence zamiast zgadywać.
7. Jeżeli nie potrafisz wiarygodnie rozpoznać nazwy, użyj "Nieznany przedmiot" i podaj maksymalnie 3 najbardziej prawdopodobne nazwy z katalogu w alternatives.
8. Każdy zajęty slot może wystąpić tylko raz. Nie łącz kilku różnych slotów w jeden wynik i nie przenoś ilości między slotami.
9. Przed odpowiedzią jeszcze raz sprawdź wszystkie cyfry w prawym dolnym rogu każdego zajętego slotu.

Zwróć WYŁĄCZNIE JSON w formacie:
{"items":[{"slotIndex":0,"row":0,"column":0,"name":"Dokładna nazwa","quantity":1,"itemConfidence":0.0,"quantityConfidence":0.0,"alternatives":[]}]}

KATALOG DOZWOLONYCH NAZW (gdy przedmiot jest rozpoznawalny):
${names}`;
}

function normalizeRecognizedItems(rawItems: RawRecognizedItem[]): RecognizedItem[] {
  const bySlot = new Map<number, RecognizedItem>();

  rawItems.slice(0, MAX_RECOGNIZED_ITEMS).forEach((raw, fallbackIndex) => {
    const rawSlot = integer(raw.slotIndex, -1);
    const rawRow = integer(raw.row, -1);
    const rawColumn = integer(raw.column, -1);
    const derivedSlot =
      rawRow >= 0 && rawColumn >= 0 && rawColumn < GRID_COLUMNS
        ? rawRow * GRID_COLUMNS + rawColumn
        : -1;
    const slotIndex = rawSlot >= 0 ? rawSlot : derivedSlot >= 0 ? derivedSlot : fallbackIndex;
    const row = rawRow >= 0 ? rawRow : Math.floor(slotIndex / GRID_COLUMNS);
    const column =
      rawColumn >= 0 && rawColumn < GRID_COLUMNS ? rawColumn : slotIndex % GRID_COLUMNS;
    const name =
      typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Nieznany przedmiot';
    const itemConfidence = confidence(raw.itemConfidence, confidence(raw.confidence, 0));
    const quantityConfidence = confidence(raw.quantityConfidence, confidence(raw.confidence, 0));
    const recognized: RecognizedItem = {
      slotIndex,
      row,
      column,
      recognizedName: name,
      quantity: positiveInteger(raw.quantity, 1),
      itemConfidence,
      quantityConfidence,
      confidence: Math.min(itemConfidence, quantityConfidence),
      alternatives: alternatives(raw.alternatives),
      catalogMatch: bestStaticCatalogMatch(name),
    };

    const existing = bySlot.get(slotIndex);
    if (!existing || recognized.confidence > existing.confidence) bySlot.set(slotIndex, recognized);
  });

  return Array.from(bySlot.values()).sort((left, right) => left.slotIndex - right.slotIndex);
}

export async function POST(request: NextRequest) {
  const viewerId = await verifiedViewerId(request);
  if (!viewerId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (rateLimited(viewerId)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: 'ai_not_configured' }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { imageDataUrl?: unknown } | null;
  if (!body || typeof body.imageDataUrl !== 'string') {
    return NextResponse.json({ error: 'invalid_image' }, { status: 400 });
  }
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(body.imageDataUrl);
  if (!match?.[1] || !match[2] || match[2].length > 12_000_000) {
    return NextResponse.json({ error: 'invalid_image' }, { status: 400 });
  }

  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3-flash-preview';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: recognitionPrompt() },
              { inlineData: { mimeType: match[1], data: match[2] } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
        },
      }),
      cache: 'no-store',
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('team economy Gemini recognition failed', response.status, detail.slice(0, 500));
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 502 });
  }
  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.find(
    (part) => typeof part.text === 'string',
  )?.text;
  if (!text) return NextResponse.json({ error: 'ai_empty_result' }, { status: 502 });

  let parsed: { items?: RawRecognizedItem[] };
  try {
    parsed = JSON.parse(text) as { items?: RawRecognizedItem[] };
  } catch {
    return NextResponse.json({ error: 'ai_invalid_result' }, { status: 502 });
  }

  const recognized = normalizeRecognizedItems(Array.isArray(parsed.items) ? parsed.items : []);

  const workspaceId = workspaceIdFromRequest(request);
  if (workspaceId) {
    const unmatched = recognized
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.catalogMatch === null && item.recognizedName !== 'Nieznany przedmiot')
      .slice(0, DYNAMIC_LOOKUP_LIMIT);
    const dynamicMatches = await Promise.all(
      unmatched.map(({ item }) => dynamicCatalogMatch(request, workspaceId, item.recognizedName)),
    );
    dynamicMatches.forEach((catalogMatch, resultIndex) => {
      const target = unmatched[resultIndex];
      if (target && catalogMatch) recognized[target.index] = { ...target.item, catalogMatch };
    });
  }

  return NextResponse.json({ items: recognized });
}
