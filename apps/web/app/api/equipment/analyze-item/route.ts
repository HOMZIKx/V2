import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const DEFAULT_VISION_MODEL = 'gpt-5.6-luna';
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

interface ResponsesApiContent {
  readonly type?: string;
  readonly text?: string;
}

interface ResponsesApiOutput {
  readonly content?: readonly ResponsesApiContent[];
}

interface ResponsesApiPayload {
  readonly output?: readonly ResponsesApiOutput[];
  readonly error?: {
    readonly message?: string;
  };
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function extractResponseText(payload: ResponsesApiPayload): string {
  return (payload.output ?? [])
    .flatMap((entry) => entry.content ?? [])
    .map((entry) => entry.text ?? '')
    .filter((entry) => entry.length > 0)
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

Zwróć wyłącznie poprawny JSON bez markdownu w formacie:
{
  "name": "nazwa bazowa przedmiotu, bez +N jeżeli +N jest widoczne osobno",
  "enhancement": 0,
  "category": "weapon|armor|helmet|shield|earrings|necklace|bracelet|shoes albo null",
  "bonuses": ["dokładnie odczytane linie bonusów"],
  "confidence": 0.0,
  "notes": "krótka informacja o niepewnych / nieczytelnych fragmentach"
}

Zasady:
- enhancement musi być liczbą 0–9; jeśli nie widać poziomu ulepszenia, użyj 0 i opisz niepewność w notes;
- category określaj wyłącznie, jeśli z nazwy/tooltipa da się rozpoznać typ przedmiotu; jeśli nie, zwróć null;
- weapon = broń, armor = zbroja, helmet = hełm/czapka, shield = tarcza, earrings = kolczyki, necklace = naszyjnik, bracelet = bransoleta, shoes = buty;
- bonusy przepisuj w języku i wartościach widocznych na tooltipie; nie dopowiadaj wartości z wiedzy o grze;
- pomijaj cenę, wagę, opis fabularny, wymagania handlu i tekst interfejsu, jeśli nie są bonusem przedmiotu;
- jeśli nazwa jest częściowo nieczytelna, podaj najlepszy odczyt i obniż confidence;
- confidence to ogólna pewność odczytu w skali 0–1.
`.trim();

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return jsonError(
      'Analiza AI nie jest skonfigurowana na serwerze. Dodaj OPENAI_API_KEY w środowisku usługi Web.',
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
  if (!(upload instanceof File)) {
    return jsonError('Brak pliku obrazu w polu image.', 400);
  }
  if (!ALLOWED_IMAGE_TYPES.has(upload.type)) {
    return jsonError('Obsługiwane formaty screena: PNG, JPG/JPEG i WEBP.', 415);
  }
  if (upload.size < 1 || upload.size > MAX_IMAGE_BYTES) {
    return jsonError('Screen musi mieć od 1 B do 8 MB.', 413);
  }

  const bytes = Buffer.from(await upload.arrayBuffer());
  const dataUrl = `data:${upload.type};base64,${bytes.toString('base64')}`;
  const model = process.env.OPENAI_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL;

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: ANALYSIS_PROMPT },
              { type: 'input_image', image_url: dataUrl },
            ],
          },
        ],
        max_output_tokens: 1200,
      }),
    });
  } catch (error) {
    console.error('equipment screenshot analysis request failed', error);
    return jsonError('Nie udało się połączyć z analizą AI.', 502);
  }

  let payload: ResponsesApiPayload;
  try {
    payload = (await response.json()) as ResponsesApiPayload;
  } catch {
    return jsonError('Usługa analizy zwróciła nieprawidłową odpowiedź.', 502);
  }

  if (!response.ok) {
    console.error('equipment screenshot analysis rejected', response.status, payload.error?.message);
    return jsonError('Analiza AI nie powiodła się. Spróbuj ponownie albo dodaj przedmiot ręcznie.', 502);
  }

  const rawText = extractResponseText(payload);
  const draft = parseAnalysisDraft(rawText);
  if (!draft) {
    console.error('equipment screenshot analysis produced invalid JSON');
    return jsonError('Nie udało się pewnie odczytać danych ze screena. Użyj dodawania ręcznego.', 422);
  }

  return NextResponse.json({
    draft,
    model,
    persisted: false,
  });
}
