import { describe, expect, it } from 'vitest';

import {
  createCharacterTimerButtonCustomId,
  parseCharacterTimerButtonCustomId,
} from './character-timer-custom-id.js';

describe('character-timer-custom-id', () => {
  const secret = 'test-signing-secret-for-character-timers';

  it('round-trips Gotowe / Przypomnij później under Discord 100-char limit', () => {
    for (const operation of ['gotowe', 'przypomnij'] as const) {
      const customId = createCharacterTimerButtonCustomId(
        operation,
        { timerId: 'timer-skill-book-a1b2c3d4' },
        secret,
      );
      expect(customId.length).toBeLessThanOrEqual(100);
      const parsed = parseCharacterTimerButtonCustomId(customId, secret);
      expect(parsed.operation).toBe(operation);
      expect(parsed.payload.timerId).toBe('timer-skill-book-a1b2c3d4');
    }
  });
});
