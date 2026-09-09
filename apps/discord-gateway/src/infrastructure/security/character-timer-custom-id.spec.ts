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

  it('round-trips the daily panel snooze delay under Discord 100-char limit', () => {
    const customId = createCharacterTimerButtonCustomId(
      'przypomnij',
      {
        timerId: 'panel-123e4567-e89b-12d3-a456-426614174000',
        snoozeMinutes: 60,
      },
      secret,
    );

    expect(customId.length).toBeLessThanOrEqual(100);
    expect(parseCharacterTimerButtonCustomId(customId, secret)).toMatchObject({
      operation: 'przypomnij',
      payload: {
        timerId: 'panel-123e4567-e89b-12d3-a456-426614174000',
        snoozeMinutes: 60,
      },
    });
  });
});
