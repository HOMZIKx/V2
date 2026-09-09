from pathlib import Path

root = Path(__file__).resolve().parents[2]
route_path = root / 'apps/web/app/api/team-economy/recognize/route.ts'
private_path = root / 'apps/web/app/economy/private/page.tsx'
team_path = root / 'apps/web/app/teams/[teamId]/economy/team-economy.tsx'
helper_path = root / 'apps/web/src/economy-ai-error.ts'
spec_path = root / 'apps/web/src/economy-ai-error.spec.ts'

route = route_path.read_text(encoding='utf-8')
private = private_path.read_text(encoding='utf-8')
team = team_path.read_text(encoding='utf-8')

anchor = "const rateBuckets = new Map<string, RateBucket>();\n"
schema = """const rateBuckets = new Map<string, RateBucket>();

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
"""
if anchor not in route:
    raise SystemExit('route rateBuckets anchor missing')
route = route.replace(anchor, schema, 1)

route = route.replace(
    "const ECONOMY_PROMPT_VERSION = 'economy-drop-grid-v1';\nconst ECONOMY_PARSER_VERSION = 'economy-slot-normalizer-v1';",
    "const ECONOMY_PROMPT_VERSION = 'economy-drop-grid-v2';\nconst ECONOMY_PARSER_VERSION = 'economy-slot-normalizer-v2';",
    1,
)

norm_anchor = "function normalizeRecognizedItems(rawItems: RawRecognizedItem[]): RecognizedItem[] {\n"
helpers = """function extractGeminiText(payload: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}): string {
  return (payload.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\\n')
    .trim();
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\\s*/iu, '')
    .replace(/\\s*```$/u, '')
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
"""
if norm_anchor not in route:
    raise SystemExit('route normalize anchor missing')
route = route.replace(norm_anchor, helpers, 1)

old_request = """  const response = await fetch(
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
"""
new_request = """  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: recognitionPrompt() },
                { inlineData: { mimeType: match[1], data: match[2] } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseJsonSchema: RECOGNITION_RESPONSE_JSON_SCHEMA,
            maxOutputTokens: 8192,
          },
        }),
        cache: 'no-store',
      },
    );
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
"""
if old_request not in route:
    raise SystemExit('old Gemini request block missing')
route = route.replace(old_request, new_request, 1)

helper_import = "import { economyAiErrorMessage } from '../../../src/economy-ai-error';\n"
private_import_anchor = "import { resolveAiObservationFeedback } from '../../../src/ai-observation-feedback';\n"
if helper_import not in private:
    if private_import_anchor not in private:
        raise SystemExit('private import anchor missing')
    private = private.replace(private_import_anchor, private_import_anchor + helper_import, 1)

private_old = """      const body = (await response.json().catch(() => ({}))) as {
        analysisId?: string | null;
        items?: AiItem[];
        error?: string;
      };
      if (!response.ok || !Array.isArray(body.items)) {
        throw new Error(
          body.error === 'ai_not_configured'
            ? 'AI nie jest skonfigurowane w tym wdrożeniu.'
            : 'AI nie rozpoznało screena.',
        );
      }
"""
private_new = """      const body = (await response.json().catch(() => ({}))) as {
        analysisId?: string | null;
        items?: AiItem[];
        error?: string;
        retryAfterSeconds?: number | null;
      };
      if (!response.ok || !Array.isArray(body.items)) {
        throw new Error(economyAiErrorMessage(body.error, body.retryAfterSeconds));
      }
      if (body.items.length === 0) {
        throw new Error('AI nie znalazło żadnego zajętego slotu na tym screenie.');
      }
"""
if private_old not in private:
    raise SystemExit('private error block missing')
private = private.replace(private_old, private_new, 1)

team_import = "import { economyAiErrorMessage } from '../../../../src/economy-ai-error';\n"
team_anchor = "import { resolveAiObservationFeedback } from '../../../../src/ai-observation-feedback';\n"
if team_import not in team:
    if team_anchor not in team:
        raise SystemExit('team import anchor missing')
    team = team.replace(team_anchor, team_anchor + team_import, 1)

team_old = """        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(
            body.error === 'ai_not_configured'
              ? 'AI nie jest skonfigurowane w tym wdrożeniu. Możesz dodać drop ręcznie.'
              : 'AI nie rozpoznało screena. Możesz poprawić wynik ręcznie.',
          );
        }
        const body = (await response.json()) as { analysisId?: string | null; items: AiItem[] };
"""
team_new = """        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
            retryAfterSeconds?: number | null;
          };
          throw new Error(economyAiErrorMessage(body.error, body.retryAfterSeconds));
        }
        const body = (await response.json()) as { analysisId?: string | null; items: AiItem[] };
        if (!Array.isArray(body.items) || body.items.length === 0) {
          throw new Error('AI nie znalazło żadnego zajętego slotu na tym screenie.');
        }
"""
if team_old not in team:
    raise SystemExit('team error block missing')
team = team.replace(team_old, team_new, 1)

helper_path.write_text("""export function economyAiErrorMessage(
  error: string | undefined,
  retryAfterSeconds?: number | null,
): string {
  switch (error) {
    case 'ai_not_configured':
      return 'AI nie jest skonfigurowane w tym wdrożeniu.';
    case 'ai_quota_exceeded': {
      const retry =
        typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? ` Spróbuj ponownie za ${Math.ceil(retryAfterSeconds)} s.`
          : ' Spróbuj ponownie za chwilę.';
      return `Limit AI Gemini jest chwilowo wyczerpany.${retry}`;
    }
    case 'rate_limited':
      return 'Za dużo prób rozpoznawania. Odczekaj kilka minut i spróbuj ponownie.';
    case 'invalid_image':
      return 'Nie udało się odczytać obrazu. Użyj PNG, JPG/JPEG albo WEBP.';
    case 'ai_empty_result':
      return 'AI nie zwróciło wyniku dla tego screena. Spróbuj ponownie.';
    case 'ai_invalid_result':
      return 'AI zwróciło nieprawidłowy wynik. Spróbuj ponownie.';
    case 'ai_unavailable':
      return 'Usługa AI jest chwilowo niedostępna. Spróbuj ponownie za chwilę.';
    case 'unauthorized':
      return 'Sesja wygasła. Odśwież stronę i zaloguj się ponownie.';
    default:
      return 'Nie udało się przeanalizować screena. Spróbuj ponownie.';
  }
}
""", encoding='utf-8')

spec_path.write_text("""import { describe, expect, it } from 'vitest';

import { economyAiErrorMessage } from './economy-ai-error';

describe('economy AI error messages', () => {
  it('does not report quota exhaustion as an unrecognized screenshot', () => {
    expect(economyAiErrorMessage('ai_quota_exceeded')).toContain('Limit AI Gemini');
    expect(economyAiErrorMessage('ai_quota_exceeded')).not.toContain('nie rozpoznało');
  });

  it('includes server retry delay when available', () => {
    expect(economyAiErrorMessage('ai_quota_exceeded', 17)).toContain('17 s');
  });

  it('distinguishes malformed AI output and request throttling', () => {
    expect(economyAiErrorMessage('ai_invalid_result')).toContain('nieprawidłowy wynik');
    expect(economyAiErrorMessage('rate_limited')).toContain('Za dużo prób');
  });
});
""", encoding='utf-8')

route_path.write_text(route, encoding='utf-8')
private_path.write_text(private, encoding='utf-8')
team_path.write_text(team, encoding='utf-8')
print('PATCH_ECONOMY_AI=OK')
