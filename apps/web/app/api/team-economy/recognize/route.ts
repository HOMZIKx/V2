import { NextRequest, NextResponse } from 'next/server';

import { gameItemCatalog } from '../../../../src/item-catalog';
import { verifiedViewerId } from '../../../../src/server/verified-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RawRecognizedItem = { name?: unknown; quantity?: unknown; confidence?: unknown };
type RateBucket = { count: number; resetAt: number };

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 20;
const DEFAULT_VISION_MODEL = 'gemini-3.8-flash';
const rateBuckets = new Map<string, RateBucket>();

const RECOGNITION_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      maxItems: 200,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'quantity', 'confidence'],
        properties: {
          name: {
            type: 'string',
            description: 'Nazwa stosu przedmiotu odczytana ze screena.',
          },
          quantity: {
            type: 'integer',
            minimum: 1,
            maximum: 999999,
            description: 'Liczba sztuk widoczna na stosie; 1, gdy liczby nie widać.',
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Pewność rozpoznania nazwy i ilości w skali 0–1.',
          },
        },
      },
    },
  },
} as const;

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

  const model = process.env.GEMINI_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL;
  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: 'To jest screenshot dropu z Metin2. Rozpoznaj każdy widoczny stos przedmiotów. Nie zgaduj nazwy, gdy nie jesteś pewny — użyj krótkiego opisu wizualnego i obniż confidence. quantity to liczba sztuk widoczna na stosie; jeśli brak liczby przyjmij 1.',
                },
                { inlineData: { mimeType: match[1], data: match[2] } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4000,
            responseMimeType: 'application/json',
            responseJsonSchema: RECOGNITION_RESPONSE_JSON_SCHEMA,
            thinkingConfig: {
              thinkingLevel: 'low',
            },
          },
        }),
        cache: 'no-store',
      },
    );
  } catch (error) {
    console.error('team economy Gemini recognition request failed', error);
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 502 });
  }

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
  return NextResponse.json({ items, provider: 'gemini', model });
}
