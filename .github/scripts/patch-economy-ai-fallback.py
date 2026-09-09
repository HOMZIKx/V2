from pathlib import Path

p = Path('apps/web/app/api/team-economy/recognize/route.ts')
s = p.read_text(encoding='utf-8')

image_old = """  if (!match?.[1] || !match[2] || match[2].length > 12_000_000) {
    return NextResponse.json({ error: 'invalid_image' }, { status: 400 });
  }
  const imageBytes = Buffer.from(match[2], 'base64');

"""
image_new = """  if (!match?.[1] || !match[2] || match[2].length > 12_000_000) {
    return NextResponse.json({ error: 'invalid_image' }, { status: 400 });
  }
  const apiKey: string = key;
  const imageMimeType = match[1] as 'image/png' | 'image/jpeg' | 'image/webp';
  const imageData = match[2];
  const imageBytes = Buffer.from(imageData, 'base64');

"""
if image_old not in s:
    raise SystemExit('validated image block not found')
s = s.replace(image_old, image_new, 1)

old = """  const model =
    process.env.GEMINI_VISION_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    'gemini-3-flash-preview';
  let response: Response;
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
"""
new = """  const primaryModel =
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
"""
if old not in s:
    raise SystemExit('Gemini request block not found')
s = s.replace(old, new, 1)
s = s.replace("    model,\n    promptVersion: ECONOMY_PROMPT_VERSION,", "    model: modelUsed,\n    promptVersion: ECONOMY_PROMPT_VERSION,", 1)
s = s.replace("    imageMimeType: match[1] as 'image/png' | 'image/jpeg' | 'image/webp',", "    imageMimeType,", 1)
s = s.replace("    model,\n    persisted: analysisId !== null,", "    model: modelUsed,\n    persisted: analysisId !== null,", 1)
p.write_text(s, encoding='utf-8')
print('PATCH_FALLBACK=OK')
