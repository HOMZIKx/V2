import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const DEFAULT_VISION_MODEL = 'gemini-3.8-flash';
const LOCAL_IDENTITY = 'http://127.0.0.1:4200';
const EQUIPMENT_CATEGORIES = new Set([
  'weapon',
  'armor',
  'helmet',
  'shield',
  'earrings',
  'necklace',
  'bracelet',
  'shoes',
]);

const ANALYSIS_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'enhancement', 'category', 'bonuses', 'confidence', 'notes'],
  properties: {
    name: {
      type: 'string',
      description: 'Bazowa nazwa przedmiotu odczytana z tooltipa.',
    },
    enhancement: {
      type: 'integer',
      minimum: 0,
      maximum: 9,
      description: 'Poziom ulepszenia +N; 0 gdy nie da się go odczytać.',
    },
    category: {
      anyOf: [
        {
          type: 'string',
          enum: ['weapon', 'armor', 'helmet', 'shield', 'earrings', 'necklace', 'bracelet', 'shoes'],
        },
        { type: 'null' },
      ],
      description: 'Slot ekwipunku albo null, gdy typ jest niepewny.',
    },
    bonuses: {
      type: 'array',
      maxItems: 12,
      items: { type: 'string' },
      description: 'Dokładnie odczytane linie bonusów z tooltipa.',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Ogólna pewność odczytu w skali 0–1.',
    },
    notes: {
      type: 'string',
      description: 'Krótka informacja o nieczytelnych lub niepewnych fragmentach.',
    },
  },
} as const;

type EquipmentCategory =
  | 'weapon'
  | 'armor'
  | 'helmet'
  | 'shield'
  | 'earrings'
  | 'necklace'
  | 'bracelet'
  | 'shoes';

interface AnalysisDraft {
  readonly name: string;
  readonly enhancement: number;
  readonly category: EquipmentCategory | null;
  readonly bonuses: readonly string[];
  readonly confidence: number;
  readonly notes: string;
}

interface GeminiPart {
  readonly text?: string;
}

interface GeminiCandidate {
  readonly content?: {
    readonly parts?: readonly GeminiPart[];
  };
}

interface GeminiPayload {
  readonly candidates?: readonly GeminiCandidate[];
  readonly error?: {
    readonly message?: string;
  };
}

type IdentityAccount = {
  readonly provider?: string;
  readonly accountId?: string;
};

type AuthenticatedDiscordSession =
  | { readonly ok: true; readonly discordUserId: string }
  | { readonly ok: false; readonly status: 401 | 503; readonly error: string };

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/$/, '');
}

function productionBackendOrigin(): string {
  return trimTrailingSlash(
    process.env.V2_BACKEND_PUBLIC_ORIGIN?.trim() || 'https://v2-api.zeabur.app',
  );
}

function identityBaseUrl(): string {
  const configured = process.env.IDENTITY_PROXY_TARGET?.trim();
  if (configured) return trimTrailingSlash(configured);
  return process.env.NODE_ENV === 'production' ? productionBackendOrigin() : LOCAL_IDENTITY;
}

async function resolveAuthenticatedDiscordSession(
  request: Request,
): Promise<AuthenticatedDiscordSession> {
  const cookie = request.headers.get('cookie');
  if (!cookie) return { ok: false, status: 401, error: 'unauthorized' };

  const headers = new Headers({ accept: 'application/json', cookie });
  const baseUrl = identityBaseUrl();

  let meResponse: Response;
  try {
    meResponse = await fetch(`${baseUrl}/identity/me`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 503, error: 'identity_unavailable' };
  }

  if (meResponse.status === 401) return { ok: false, status: 401, error: 'unauthorized' };
  if (!meResponse.ok) return { ok: false, status: 503, error: 'identity_unavailable' };

  let accountsResponse: Response;
  try {
    accountsResponse = await fetch(`${baseUrl}/identity/accounts`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 503, error: 'identity_unavailable' };
  }

  if (accountsResponse.status === 401) return { ok: false, status: 401, error: 'unauthorized' };
  if (!accountsResponse.ok) return { ok: false, status: 503, error: 'identity_unavailable' };

  let accountsBody: { readonly accounts?: readonly IdentityAccount[] };
  try {
    accountsBody = (await accountsResponse.json()) as {
      readonly accounts?: readonly IdentityAccount[];
    };
  } catch {
    return { ok: false, status: 503, error: 'identity_unavailable' };
  }

  const discordUserId = accountsBody.accounts
    ?.find((account) => account.provider === 'discord')
    ?.accountId?.trim();

  if (!discordUserId || !/^\d{17,20}$/.test(discordUserId)) {
    return { ok: false, status: 401, error: 'discord_session_required' };
  }

  return { ok: true, discordUserId };
}

function extractGeminiText(payload: GeminiPayload): string {
  return (payload.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? '')
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

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function clampConfidence(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(1, Math.max(0, parsed));
}

function parseCategory(value: unknown): EquipmentCategory | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLocaleLowerCase('en-US');
  return EQUIPMENT_CATEGORIES.has(normalized) ? (normalized as EquipmentCategory) : null;
}

function parseAnalysisDraft(raw: string): AnalysisDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const source = parsed as Record<string, unknown>;
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  if (name.length < 2) return null;

  const bonuses = Array.isArray(source.bonuses)
    ? source.bonuses
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .slice(0, 12)
    : [];

  return {
    name,
    enhancement: clampInteger(source.enhancement, 0, 9, 0),
    category: parseCategory(source.category),
    bonuses,
    confidence: clampConfidence(source.confidence),
    notes: typeof source.notes === 'string' ? source.notes.trim().slice(0, 500) : '',
  };
}

const ANALYSIS_PROMPT = `
Analizujesz WYŁĄCZNIE pojedynczy tooltip przedmiotu z gry Metin2 / Projekt Hard.
To jest etap roboczy: NIE zapisujesz niczego do bazy i NIE wymyślasz brakujących danych.

Odczytaj pola zgodne z wymaganym schematem JSON.

Zasady:
- name = nazwa bazowa przedmiotu, bez +N jeżeli +N jest widoczne osobno;
- enhancement musi być liczbą 0–9; jeśli nie widać poziomu ulepszenia, użyj 0 i opisz niepewność w notes;
- category określaj wyłącznie, jeśli z nazwy/tooltipa da się rozpoznać typ przedmiotu; jeśli nie, zwróć null;
- weapon = broń, armor = zbroja, helmet = hełm/czapka, shield = tarcza, earrings = kolczyki, necklace = naszyjnik, bracelet = bransoleta, shoes = buty;
- bonusy przepisuj w języku i wartościach widocznych na tooltipie; nie dopowiadaj wartości z wiedzy o grze;
- pomijaj cenę, wagę, opis fabularny, wymagania handlu i tekst interfejsu, jeśli nie są bonusem przedmiotu;
- jeśli nazwa jest częściowo nieczytelna, podaj najlepszy odczyt i obniż confidence;
- confidence to ogólna pewność odczytu w skali 0–1.
`.trim();

export async function POST(request: Request) {
  const session = await resolveAuthenticatedDiscordSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return jsonError(
      'Analiza AI nie jest skonfigurowana na serwerze. Dodaj GEMINI_API_KEY w środowisku usługi Web.',
      503,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError('Nie udało się odczytać formularza ze screenem.', 400);
  }

  const upload = form.get('image');
  if (!(upload instanceof File)) return jsonError('Brak pliku obrazu w polu image.', 400);
  if (!ALLOWED_IMAGE_TYPES.has(upload.type)) {
    return jsonError('Obsługiwane formaty screena: PNG, JPG/JPEG i WEBP.', 415);
  }
  if (upload.size < 1 || upload.size > MAX_IMAGE_BYTES) {
    return jsonError('Screen musi mieć od 1 B do 8 MB.', 413);
  }

  const bytes = Buffer.from(await upload.arrayBuffer());
  const base64Image = bytes.toString('base64');
  const model = process.env.GEMINI_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: ANALYSIS_PROMPT },
              {
                inlineData: {
                  mimeType: upload.type,
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1200,
          responseMimeType: 'application/json',
          responseJsonSchema: ANALYSIS_RESPONSE_JSON_SCHEMA,
          thinkingConfig: {
            thinkingLevel: 'low',
          },
        },
      }),
    });
  } catch (error) {
    console.error('equipment screenshot Gemini request failed', error);
    return jsonError('Nie udało się połączyć z analizą AI.', 502);
  }

  let payload: GeminiPayload;
  try {
    payload = (await response.json()) as GeminiPayload;
  } catch {
    return jsonError('Usługa analizy zwróciła nieprawidłową odpowiedź.', 502);
  }

  if (!response.ok) {
    console.error('equipment screenshot Gemini rejected', response.status, payload.error?.message);
    return jsonError('Analiza AI nie powiodła się. Spróbuj ponownie albo dodaj przedmiot ręcznie.', 502);
  }

  const rawText = extractGeminiText(payload);
  const draft = parseAnalysisDraft(rawText);
  if (!draft) {
    console.error('equipment screenshot Gemini produced invalid JSON');
    return jsonError('Nie udało się pewnie odczytać danych ze screena. Użyj dodawania ręcznego.', 422);
  }

  return NextResponse.json({
    draft,
    model,
    provider: 'gemini',
    persisted: false,
  });
}
