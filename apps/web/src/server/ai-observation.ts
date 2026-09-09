import { createHash } from 'node:crypto';

import { internalWebUrl } from './internal-web-origin';

export type AiObservationType = 'equipment' | 'economy';

export type AiObservationRecordInput = {
  readonly analysisType: AiObservationType;
  readonly workspaceId?: string | null;
  readonly characterId?: string | null;
  readonly model: string;
  readonly promptVersion: string;
  readonly parserVersion: string;
  readonly confidence?: number | null;
  readonly imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  readonly imageBytes: Uint8Array;
  readonly aiOutput: unknown;
};

function imageSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function recordAiObservation(
  request: Request,
  input: AiObservationRecordInput,
): Promise<string | null> {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;

  try {
    const response = await fetch(internalWebUrl(request.url, '/player-team/v1/ai-observations'), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        analysisType: input.analysisType,
        workspaceId: input.workspaceId ?? null,
        characterId: input.characterId ?? null,
        model: input.model,
        promptVersion: input.promptVersion,
        parserVersion: input.parserVersion,
        confidence: input.confidence ?? null,
        image: {
          mimeType: input.imageMimeType,
          sizeBytes: input.imageBytes.byteLength,
          sha256: imageSha256(input.imageBytes),
        },
        aiOutput: input.aiOutput,
      }),
      cache: 'no-store',
    });
    if (!response.ok) {
      console.error('AI observation persistence rejected', input.analysisType, response.status);
      return null;
    }
    const body = (await response.json()) as { id?: unknown };
    return typeof body.id === 'string' && body.id.length > 0 ? body.id : null;
  } catch (error) {
    console.error('AI observation persistence failed', input.analysisType, error);
    return null;
  }
}
