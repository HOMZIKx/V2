import { NextRequest, NextResponse } from 'next/server';

import { gameItemCatalog } from '../../../../src/item-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RawRecognizedItem = { name?: unknown; quantity?: unknown; confidence?: unknown };
type RateBucket = { count: number; resetAt: number };

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 20;
const rateBuckets = new Map<string, RateBucket>();

function normalizeTarget(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/$/, '');
  return trimmed ? trimmed : null;
}

function identityTarget(): string {
  const productionBackendOrigin =
    normalizeTarget(process.env.V2_BACKEND_PUBLIC_ORIGIN) ?? 'https://v2-api.zeabur.app';
  return (
    normalizeTarget(process.env.IDENTITY_PROXY_TARGET) ??
    (process.env.NODE_ENV === 'production' ? productionBackendOrigin : 'http://127.0.0.1:4200')
  );
}

async function verifiedViewerId(request: NextRequest): Promise<string | null> {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  try {
    const response = await fetch(`${identityTarget()}/identity/me`, {
      method: 'GET',
      headers: { accept: 'application/json', cookie },
      cache: 'no-store',
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error(`identity /me failed: ${response.status}`);
    const body = (await response.json()) as { id?: unknown };
    return typeof body.id === 'string' && body.id.trim() ? body.id.trim() : null;
  } catch (error) {
    console.error('team economy AI: identity verification failed', error);
    return null;
  }
}

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

function bestCatalogMatch(name: string) {
  const target = normalize(name);
  if (!target) return null;
  const exact = gameItemCatalog.find((item) => normalize(item.title) === target);
  if (exact) return exact;
  const candidates = gameItemCatalog.filter((item) => {
    const title = normalize(item.title);
    return title.includes(target) || target.includes(title);
  });
  return candidates.length === 1 ? candidates[0] : null;
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

  const items = (Array.isArray(parsed.items) ? parsed.items : []).slice(0, 200).map((raw) => {
    const name =
      typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Nieznany przedmiot';
    const quantity = Number.isFinite(Number(raw.quantity))
      ? Math.max(1, Math.floor(Number(raw.quantity)))
      : 1;
    const confidence = Number.isFinite(Number(raw.confidence))
      ? Math.max(0, Math.min(1, Number(raw.confidence)))
      : 0;
    const catalog = bestCatalogMatch(name);
    return {
      recognizedName: name,
      quantity,
      confidence,
      catalogMatch: catalog
        ? {
            id: catalog.id,
            name: catalog.title,
            category: catalog.category,
            imageUrl: catalog.sourceImageUrl ?? catalog.imagePath,
          }
        : null,
    };
  });
  return NextResponse.json({ items });
}
