import { NextRequest, NextResponse } from 'next/server';

import { gameItemCatalog } from '../../../../src/item-catalog';
import { verifiedViewerId } from '../../../../src/server/verified-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RawRecognizedItem = { name?: unknown; quantity?: unknown; confidence?: unknown };
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

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 20;
const DYNAMIC_LOOKUP_LIMIT = 40;
const rateBuckets = new Map<string, RateBucket>();

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
              {
                text: 'To jest screenshot dropu z Metin2. Rozpoznaj każdy widoczny stos przedmiotów. Zwróć WYŁĄCZNIE JSON: {"items":[{"name":"nazwa przedmiotu","quantity":1,"confidence":0.0}]}. quantity to liczba sztuk widoczna na stosie; jeśli brak liczby przyjmij 1. Nie zgaduj nazwy, gdy nie jesteś pewny — użyj krótkiego opisu wizualnego i niskiego confidence.',
              },
              { inlineData: { mimeType: match[1], data: match[2] } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
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

  const recognized = (Array.isArray(parsed.items) ? parsed.items : []).slice(0, 200).map((raw) => {
    const name =
      typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Nieznany przedmiot';
    return {
      recognizedName: name,
      quantity: Number.isFinite(Number(raw.quantity))
        ? Math.max(1, Math.floor(Number(raw.quantity)))
        : 1,
      confidence: Number.isFinite(Number(raw.confidence))
        ? Math.max(0, Math.min(1, Number(raw.confidence)))
        : 0,
      catalogMatch: bestStaticCatalogMatch(name),
    };
  });

  const workspaceId = workspaceIdFromRequest(request);
  if (workspaceId) {
    const unmatched = recognized
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.catalogMatch === null)
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
