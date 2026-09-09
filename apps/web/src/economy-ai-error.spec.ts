import { describe, expect, it } from 'vitest';

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
