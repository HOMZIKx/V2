import { describe, expect, it } from 'vitest';

import { POST } from '../app/api/equipment/analyze-item/route.js';

describe('equipment screenshot analysis route', () => {
  it('rejects requests without an authenticated Identity cookie before OpenAI is used', async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key-that-must-not-be-used';

    try {
      const response = await POST(
        new Request('http://localhost/api/equipment/analyze-item', {
          method: 'POST',
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ error: 'unauthorized' });
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });
});
