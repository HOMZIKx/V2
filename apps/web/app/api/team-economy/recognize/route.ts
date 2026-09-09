import { NextRequest, NextResponse } from 'next/server';

import { gameItemCatalog } from '../../../../src/item-catalog';
import { recordAiObservation } from '../../../../src/server/ai-observation';
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
type PositionedRecognizedItem = RecognizedItem & {
  positionKey: string;
  sortRank: number;
};

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 20;
const DYNAMIC_LOOKUP_LIMIT = 40;
const MAX_RECOGNIZED_ITEMS = 200;
const MAX_CATALOG_NAMES_IN_PROMPT = 1200;
const MIN_AUTO_NAME_CONFIDENCE = 0.72;
const ECONOMY_PROMPT_VERSION = 'economy-drop-grid-v2';
const ECONOMY_PARSER_VERSION = 'economy-slot-normalizer-v2';
const rateBuckets = new Map<string, RateBucket>();

const RECOGNITION_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      maxItems: MAX_RECOGNIZED_ITEMS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'slotIndex',
          'row',
          'column',
          'name',
          'quantity',
          'itemConfidence',
          'quantityConfidence',
          'alternatives',
        ],
        properties: {
          slotIndex: { type: 'integer' },
          row: { type: 'integer' },
          column: { type: 'integer' },
          name: { type: 'string' },
          quantity: { type: 'integer', minimum: 1 },
          itemConfidence: { type: 'number', minimum: 0, maximum: 1 },
          quantityConfidence: { type: 'number', minimum: 0, maximum: 1 },
          alternatives: { type: 'array', maxItems: 3, items: { type: 'string' } },
        },
      },
    },
  },
} as const;

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
  if (!target || target === normalize('Nieznany przedmiot')) return null;
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

function workspaceIdFromBody(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 160 ? trimmed : null;
}

function chooseDynamicMatch(
  name: string,
  rows: readonly DynamicCatalogItem[],
): CatalogMatch | null {
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
  const match =
    candidates.length === 1
      ? candidates[0]
      : candidates.length === 0 && rows.length === 1
        ? rows[0]
        : null;
  return match
    ? {
        id: match.id,
        name: match.canonicalName,
        category: match.category,
        imageUrl: match.imageUrl,
      }
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
  return `Jesteś modułem odczytu ekwipunku/dropu z Metin2.

WAŻNE: screenshot może być przycięty i może mieć 2, 3, 4, 5 albo inną liczbę kolumn. NIE zakładaj stałej liczby kolumn. Najpierw sam wykryj widoczną siatkę slotów po ramkach i odstępach.

ZADANIE:
1. Analizuj KAŻDY WIDOCZNY SLOT osobno, od lewej do prawej i od góry do dołu.
2. Pomijaj puste sloty. Nie twórz przedmiotu dla pustego pola.
3. row i column liczymy od 0 względem widocznego, przyciętego obrazu. slotIndex ma tylko zachować kolejność od lewej do prawej, z góry na dół — nie wyliczaj go ze stałej liczby kolumn.
4. Najpierw ustal wygląd IKONY w konkretnym slocie, dopiero potem nazwę. Katalog nazw poniżej jest wyłącznie słownikiem normalizującym — sama obecność nazwy na liście NIE jest dowodem, że ikona przedstawia ten przedmiot.
5. Jeśli ikonę naprawdę rozpoznajesz i odpowiada pozycji z katalogu, zwróć DOKŁADNĄ nazwę katalogową.
6. Jeśli pewność nazwy jest mniejsza niż ok. 0.72, NIE zgaduj. Ustaw name="Nieznany przedmiot", obniż itemConfidence i w alternatives podaj maksymalnie 3 możliwe nazwy. Lepszy wynik „nieznany” niż błędny przedmiot.
7. Ilość odczytuj WYŁĄCZNIE z białej liczby nałożonej w prawym dolnym rogu TEGO SAMEGO slotu. Liczba może mieć 1, 2 lub 3 cyfry (np. 5, 14, 87). Jeśli liczby naprawdę nie ma, quantity=1. Nie przenoś liczby z sąsiedniego slotu.
8. Oceniaj osobno itemConfidence i quantityConfidence. Jeśli małe cyfry są nieostre, obniż quantityConfidence zamiast wymyślać inną liczbę.
9. Każdy zajęty slot może wystąpić tylko raz. Nie łącz slotów — sumowanie identycznych przedmiotów wykona aplikacja później.
10. Przed odpowiedzią policz ponownie zajęte sloty i sprawdź wszystkie liczby w prawym dolnym rogu.

Zwróć WYŁĄCZNIE JSON:
{"items":[{"slotIndex":0,"row":0,"column":0,"name":"Dokładna nazwa albo Nieznany przedmiot","quantity":1,"itemConfidence":0.0,"quantityConfidence":0.0,"alternatives":[]}]}

KATALOG NAZW DO NORMALIZACJI (nie traktuj go jako dowodu wizualnego):
${names}`;
}

function extractGeminiText(payload: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}): string {
  return (payload.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim();
}

function retryAfterSeconds(response: Response): number | null {
  const raw = response.headers.get('retry-after')?.trim();
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  const at = Date.parse(raw);
  if (!Number.isFinite(at)) return null;
  return Math.max(1, Math.ceil((at - Date.now()) / 1000));
}

function normalizeRecognizedItems(rawItems: RawRecognizedItem[]): RecognizedItem[] {
  const byPosition = new Map<string, PositionedRecognizedItem>();

  rawItems.slice(0, MAX_RECOGNIZED_ITEMS).forEach((raw, fallbackIndex) => {
    const rawSlot = integer(raw.slotIndex, -1);
    const rawRow = integer(raw.row, -1);
    const rawColumn = integer(raw.column, -1);
    const hasCoordinates = rawRow >= 0 && rawColumn >= 0;
    const positionKey = hasCoordinates
      ? `grid:${rawRow}:${rawColumn}`
      : rawSlot >= 0
        ? `slot:${rawSlot}`
        : `fallback:${fallbackIndex}`;
    const sortRank = hasCoordinates
      ? rawRow * 10_000 + rawColumn
      : rawSlot >= 0
        ? 1_000_000 + rawSlot
        : 2_000_000 + fallbackIndex;
    const rawName =
      typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Nieznany przedmiot';
    const itemConfidence = confidence(raw.itemConfidence, confidence(raw.confidence, 0));
    const quantityConfidence = confidence(raw.quantityConfidence, confidence(raw.confidence, 0));
    const suggestionList = alternatives(raw.alternatives);
    const trustedName = itemConfidence >= MIN_AUTO_NAME_CONFIDENCE ? rawName : 'Nieznany przedmiot';
    const fallbackSuggestions =
      trustedName === 'Nieznany przedmiot' && rawName !== 'Nieznany przedmiot'
        ? [rawName, ...suggestionList].slice(0, 3)
        : suggestionList;
    const catalogMatch =
      trustedName === 'Nieznany przedmiot' ? null : bestStaticCatalogMatch(trustedName);
    const recognized: PositionedRecognizedItem = {
      positionKey,
      sortRank,
      slotIndex: rawSlot >= 0 ? rawSlot : fallbackIndex,
      row: rawRow,
      column: rawColumn,
      recognizedName: trustedName,
      quantity: positiveInteger(raw.quantity, 1),
      itemConfidence,
      quantityConfidence,
      confidence: Math.min(itemConfidence, quantityConfidence),
      alternatives: fallbackSuggestions,
      catalogMatch,
    };

    const existing = byPosition.get(positionKey);
    if (!existing || recognized.confidence > existing.confidence) {
      byPosition.set(positionKey, recognized);
    }
  });

  return Array.from(byPosition.values())
    .sort((left, right) => left.sortRank - right.sortRank)
    .map((positioned, index) => ({
      slotIndex: index,
      row: positioned.row,
      column: positioned.column,
      recognizedName: positioned.recognizedName,
      quantity: positioned.quantity,
      itemConfidence: positioned.itemConfidence,
      quantityConfidence: positioned.quantityConfidence,
      confidence: positioned.confidence,
      alternatives: positioned.alternatives,
      catalogMatch: positioned.catalogMatch,
    }));
}

function aggregateConfidence(items: readonly RecognizedItem[]): number | null {
  if (items.length === 0) return null;
  return items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
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

  const body = (await request.json().catch(() => null)) as {
    imageDataUrl?: unknown;
    workspaceId?: unknown;
  } | null;
  if (!body || typeof body.imageDataUrl !== 'string') {
    return NextResponse.json({ error: 'invalid_image' }, { status: 400 });
  }
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(body.imageDataUrl);
  if (!match?.[1] || !match[2] || match[2].length > 12_000_000) {
    return NextResponse.json({ error: 'invalid_image' }, { status: 400 });
  }
  const apiKey: string = key;
  const imageMimeType = match[1] as 'image/png' | 'image/jpeg' | 'image/webp';
  const imageData = match[2];
  const imageBytes = Buffer.from(imageData, 'base64');

  const primaryModel =
    process.env.GEMINI_VISION_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    'gemini-3-flash-preview';
  const fallbackModel = process.env.GEMINI_ECONOMY_FALLBACK_MODEL?.trim() || 'gemini-3.8-flash';

  async function requestGemini(modelName: string): Promise<Response> {
    const generationConfig =
      modelName === 'gemini-3.8-flash'
        ? {
            responseMimeType: 'application/json',
            responseJsonSchema: RECOGNITION_RESPONSE_JSON_SCHEMA,
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingLevel: 'low' },
          }
        : {
            temperature: 0,
            responseMimeType: 'application/json',
            responseJsonSchema: RECOGNITION_RESPONSE_JSON_SCHEMA,
            maxOutputTokens: 8192,
          };

    return fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: recognitionPrompt() },
                { inlineData: { mimeType: imageMimeType, data: imageData } },
              ],
            },
          ],
          generationConfig,
        }),
        cache: 'no-store',
      },
    );
  }

  let modelUsed = primaryModel;
  let response: Response;
  try {
    response = await requestGemini(primaryModel);
    const shouldFallback =
      fallbackModel !== primaryModel &&
      (response.status === 400 ||
        response.status === 404 ||
        response.status === 429 ||
        response.status >= 500);
    if (shouldFallback) {
      console.warn(
        'team economy Gemini primary model unavailable, trying fallback',
        primaryModel,
        response.status,
        fallbackModel,
      );
      response = await requestGemini(fallbackModel);
      modelUsed = fallbackModel;
    }
  } catch (error) {
    console.error('team economy Gemini request failed', error);
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 502 });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('team economy Gemini recognition failed', response.status, detail.slice(0, 500));
    if (response.status === 429) {
      return NextResponse.json(
        {
          error: 'ai_quota_exceeded',
          retryAfterSeconds: retryAfterSeconds(response),
        },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 502 });
  }

  let payload: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'ai_invalid_result' }, { status: 502 });
  }

  const text = extractGeminiText(payload);
  if (!text) return NextResponse.json({ error: 'ai_empty_result' }, { status: 502 });

  let parsed: { items?: RawRecognizedItem[] };
  try {
    parsed = JSON.parse(stripJsonFence(text)) as { items?: RawRecognizedItem[] };
  } catch {
    return NextResponse.json({ error: 'ai_invalid_result' }, { status: 502 });
  }

  const recognized = normalizeRecognizedItems(Array.isArray(parsed.items) ? parsed.items : []);

  const workspaceId = workspaceIdFromBody(body.workspaceId) ?? workspaceIdFromRequest(request);
  if (workspaceId) {
    const unmatched = recognized
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item }) => item.catalogMatch === null && item.recognizedName !== 'Nieznany przedmiot',
      )
      .slice(0, DYNAMIC_LOOKUP_LIMIT);
    const dynamicMatches = await Promise.all(
      unmatched.map(({ item }) => dynamicCatalogMatch(request, workspaceId, item.recognizedName)),
    );
    dynamicMatches.forEach((catalogMatch, resultIndex) => {
      const target = unmatched[resultIndex];
      if (target && catalogMatch) recognized[target.index] = { ...target.item, catalogMatch };
    });
  }

  const analysisId = await recordAiObservation(request, {
    analysisType: 'economy',
    workspaceId,
    model: modelUsed,
    promptVersion: ECONOMY_PROMPT_VERSION,
    parserVersion: ECONOMY_PARSER_VERSION,
    confidence: aggregateConfidence(recognized),
    imageMimeType,
    imageBytes,
    aiOutput: {
      rawItems: Array.isArray(parsed.items) ? parsed.items : [],
      normalizedItems: recognized,
    },
  });

  return NextResponse.json({
    analysisId,
    items: recognized,
    model: modelUsed,
    persisted: analysisId !== null,
  });
}
